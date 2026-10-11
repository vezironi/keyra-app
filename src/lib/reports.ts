import type { Settings, Subscription } from "./types";
import { daysBetween, todayKey } from "./format";
import { isBilling, monthlyCost, toBase } from "./subscriptions";

/** Spending for one calendar year, from recorded payments, in the base currency. */
export interface YearReport {
  /** Index 0 = January. */
  months: number[];
  total: number;
  byCategory: { name: string; total: number }[];
  byCard: { cardId: string | null; total: number }[];
  bySub: { sub: Subscription; total: number }[];
}

export function yearReport(subs: Subscription[], settings: Settings, year: number): YearReport {
  const months = Array<number>(12).fill(0);
  const cat = new Map<string, number>();
  const card = new Map<string | null, number>();
  const bySub: YearReport["bySub"] = [];
  for (const sub of subs) {
    let subTotal = 0;
    for (const p of sub.payments) {
      if (Number(p.date.slice(0, 4)) !== year) continue;
      const amount = toBase(p.amount, p.currency, settings);
      months[Number(p.date.slice(5, 7)) - 1] += amount;
      subTotal += amount;
    }
    if (!subTotal) continue;
    bySub.push({ sub, total: subTotal });
    cat.set(sub.category, (cat.get(sub.category) ?? 0) + subTotal);
    card.set(sub.cardId, (card.get(sub.cardId) ?? 0) + subTotal);
  }
  const sorted = <K>(m: Map<K, number>) => [...m].sort((a, b) => b[1] - a[1]);
  return {
    months,
    total: months.reduce((a, b) => a + b, 0),
    byCategory: sorted(cat).map(([name, total]) => ({ name, total })),
    byCard: sorted(card).map(([cardId, total]) => ({ cardId, total })),
    bySub: bySub.sort((a, b) => b.total - a.total),
  };
}

/** Years that have at least one payment, plus the current year, newest first. */
export function reportYears(subs: Subscription[]): number[] {
  const years = new Set([new Date().getFullYear()]);
  for (const s of subs) for (const p of s.payments) years.add(Number(p.date.slice(0, 4)));
  return [...years].sort((a, b) => b - a);
}

/** Still billing, but the user says they rarely or never use it. */
export const isUnused = (s: Subscription) => isBilling(s) && (s.usage === "rarely" || s.usage === "never");

/** Billing for 60+ days without a usage rating: worth asking about. */
export const needsUsageReview = (s: Subscription) => isBilling(s) && !s.usage && !!s.startDate && daysBetween(s.startDate, todayKey()) >= 60;

export const yearlyCost = (s: Subscription, settings: Settings) => toBase(monthlyCost(s), s.currency, settings) * 12;
