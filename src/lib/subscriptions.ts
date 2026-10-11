import type { BillingCycle, Settings, Subscription, SubscriptionStatus, SubscriptionUsage } from "./types";
import { t, tDynamic } from "@/i18n";
import { daysBetween, parseDateKey, toDateKey, todayKey, uid } from "./format";

export const CYCLES: BillingCycle[] = ["weekly", "monthly", "quarterly", "semiannual", "yearly", "custom"];
export const STATUSES: SubscriptionStatus[] = ["active", "trial", "paused", "cancelled"];

export const cycleLabel = (c: BillingCycle) => tDynamic(`cycle.${c}`);
export const cycleShort = (c: BillingCycle) => tDynamic(`cycleShort.${c}`);
export const statusLabel = (s: SubscriptionStatus) => tDynamic(`status.${s}`);

export const USAGES: Exclude<SubscriptionUsage, "">[] = ["often", "sometimes", "rarely", "never"];
export const usageLabel = (u: SubscriptionUsage) => tDynamic(`usage.${u || "unknown"}`);

export const STATUS_STYLE: Record<SubscriptionStatus, string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  trial: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  paused: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  cancelled: "bg-neutral-500/10 text-fg-3",
};

/** Starter categories, created in the user's language when a vault is first made. */
export const defaultCategories = () => t("categories.defaults").split("|");

export const CURRENCIES = ["TRY", "USD", "EUR", "GBP"];

const MONTHS: Partial<Record<BillingCycle, number>> = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12 };

/**
 * Moves a date forward by `times` billing cycles. Month-based cycles keep the
 * subscription's anchor day (e.g. the 31st) and clamp to short months, so the
 * billing day never drifts (Jan 31 → Feb 28 → Mar 31).
 */
export function addCycles(key: string, sub: Pick<Subscription, "cycle" | "cycleDays" | "startDate">, times = 1): string {
  const d = parseDateKey(key);
  const months = MONTHS[sub.cycle];
  if (months) {
    const anchor = sub.startDate ? parseDateKey(sub.startDate).getDate() : d.getDate();
    const target = new Date(d.getFullYear(), d.getMonth() + months * times, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(anchor, lastDay));
    return toDateKey(target);
  }
  const days = sub.cycle === "weekly" ? 7 : Math.max(1, sub.cycleDays || 30);
  d.setDate(d.getDate() + days * times);
  return toDateKey(d);
}

/** Average cost per month in the subscription's own currency. */
export function monthlyCost(sub: Subscription): number {
  switch (sub.cycle) {
    case "weekly":
      return (sub.price * 52) / 12;
    case "monthly":
      return sub.price;
    case "quarterly":
      return sub.price / 3;
    case "semiannual":
      return sub.price / 6;
    case "yearly":
      return sub.price / 12;
    case "custom":
      return (sub.price * 30.4375) / Math.max(1, sub.cycleDays || 30);
  }
}

export function toBase(amount: number, currency: string, settings: Settings): number {
  if (currency === settings.baseCurrency) return amount;
  const rate = settings.rates[currency];
  const baseRate = settings.rates[settings.baseCurrency] ?? 1;
  return rate ? (amount * rate) / baseRate : amount;
}

export const isBilling = (s: Subscription) => s.status === "active" || s.status === "trial";

/** Upcoming charge dates within [fromKey, toKey]. */
export function occurrencesBetween(sub: Subscription, fromKey: string, toKey: string): string[] {
  if (!isBilling(sub) || !sub.nextBillingDate) return [];
  const out: string[] = [];
  let cur = sub.nextBillingDate;
  for (let i = 0; i < 400 && cur <= toKey; i++) {
    if (cur >= fromKey) out.push(cur);
    cur = addCycles(cur, sub);
  }
  return out;
}

export function daysUntilNext(sub: Subscription): number {
  return daysBetween(todayKey(), sub.nextBillingDate);
}

/**
 * Brings subscriptions up to date: every billing date that has passed is logged
 * as an automatic payment and the next billing date moves forward. A trial whose
 * end date passed becomes active. Returns null when nothing changed.
 */
export function reconcile(subs: Subscription[]): Subscription[] | null {
  const today = todayKey();
  let changed = false;
  const next = subs.map((sub) => {
    if (!isBilling(sub) || !sub.nextBillingDate || sub.nextBillingDate >= today) return sub;
    changed = true;
    const s = { ...sub, payments: [...sub.payments] };
    if (s.status === "trial") s.status = "active";
    for (let i = 0; i < 400 && s.nextBillingDate < today; i++) {
      s.payments.push({
        id: uid(),
        date: s.nextBillingDate,
        amount: s.price,
        currency: s.currency,
        note: "",
        auto: true,
      });
      s.nextBillingDate = addCycles(s.nextBillingDate, s);
    }
    s.updatedAt = new Date().toISOString();
    return s;
  });
  return changed ? next : null;
}

export function totalPaid(sub: Subscription, settings: Settings): number {
  return sub.payments.reduce((sum, p) => sum + toBase(p.amount, p.currency, settings), 0);
}

/** Spending per calendar month (YYYY-MM) from recorded payments, in base currency. */
export function spendingByMonth(subs: Subscription[], settings: Settings, months: number): { key: string; total: number }[] {
  const now = new Date();
  const buckets = Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    return { key: toDateKey(d).slice(0, 7), total: 0 };
  });
  const index = new Map(buckets.map((b, i) => [b.key, i]));
  for (const s of subs)
    for (const p of s.payments) {
      const i = index.get(p.date.slice(0, 7));
      if (i !== undefined) buckets[i].total += toBase(p.amount, p.currency, settings);
    }
  return buckets;
}
