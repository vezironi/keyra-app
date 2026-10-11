import { useState } from "react";
import { Plus } from "lucide-react";
import type { BillingCycle, CardItem, LoginItem, Subscription, SubscriptionStatus, SubscriptionUsage } from "../../lib/types";
import { useVault } from "../../lib/store";
import { DEMO_LIMITS, demoLimitReached } from "../../lib/demo";
import { maskCardNumber, nowIso, todayKey } from "../../lib/format";
import { CURRENCIES, CYCLES, STATUSES, addCycles, cycleLabel, defaultCategories, statusLabel, USAGES, usageLabel } from "../../lib/subscriptions";
import { Button, DatePicker, Field, IconButton, Input, Modal, Select, Textarea } from "@/components/kit";
import { SiteIcon } from "../../components/visuals";
import { t } from "@/i18n";

/** Popular services for one-click setup. Prices are left blank because they change often. */
/** `category` is an index into the starter categories, so presets work in any language. */
const PRESETS: { name: string; url: string; category: number }[] = [
  { name: "Netflix", url: "netflix.com", category: 0 },
  { name: "Spotify", url: "spotify.com", category: 1 },
  { name: "YouTube Premium", url: "youtube.com", category: 0 },
  { name: "Disney+", url: "disneyplus.com", category: 0 },
  { name: "Amazon Prime", url: "amazon.com.tr", category: 9 },
  { name: "HBO Max", url: "max.com", category: 0 },
  { name: "Apple Music", url: "music.apple.com", category: 1 },
  { name: "iCloud+", url: "icloud.com", category: 3 },
  { name: "Google One", url: "one.google.com", category: 3 },
  { name: "ChatGPT Plus", url: "chatgpt.com", category: 4 },
  { name: "Claude Pro", url: "claude.ai", category: 4 },
  { name: "GitHub Copilot", url: "github.com", category: 2 },
  { name: "Microsoft 365", url: "microsoft.com", category: 2 },
  { name: "Adobe Creative Cloud", url: "adobe.com", category: 2 },
  { name: "Figma", url: "figma.com", category: 2 },
  { name: "Notion", url: "notion.so", category: 2 },
  { name: "Xbox Game Pass", url: "xbox.com", category: 5 },
  { name: "PlayStation Plus", url: "playstation.com", category: 5 },
  { name: "Exxen", url: "exxen.com", category: 0 },
  { name: "Duolingo", url: "duolingo.com", category: 7 },
];

/** First billing date on or after today, stepping from the start date. */
function firstUpcoming(sub: Subscription): string {
  const today = todayKey();
  let cur = sub.startDate || today;
  for (let i = 0; i < 1000 && cur < today; i++) cur = addCycles(cur, sub);
  return cur;
}

interface Props {
  initial: Subscription;
  isNew: boolean;
  onClose: () => void;
  onSaved: (s: Subscription) => void;
}

export function SubscriptionEditor({ initial, isNew, onClose, onSaved }: Props) {
  const { data, update, toast } = useVault();
  const [s, setS] = useState(initial);
  const [nextTouched, setNextTouched] = useState(!isNew);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const cards = data.items.filter((i): i is CardItem => i.type === "card");
  const logins = data.items.filter((i): i is LoginItem => i.type === "login");

  /** Applies a patch and keeps the next billing date in sync until the user edits it by hand. */
  const set = (patch: Partial<Subscription>) =>
    setS((prev) => {
      const next = { ...prev, ...patch };
      if (next.status === "trial" && next.trialEndsAt) next.nextBillingDate = next.trialEndsAt;
      else if (!nextTouched && ("startDate" in patch || "cycle" in patch || "cycleDays" in patch)) next.nextBillingDate = firstUpcoming(next);
      return next;
    });

  const save = () => {
    if (!s.name.trim()) return toast(t("subs.nameRequired"), "error");
    if (!(s.price >= 0)) return toast(t("subs.invalidAmount"), "error");
    if (!s.nextBillingDate) return toast(t("subs.nextRequired"), "error");
    if (isNew && demoLimitReached(data, "subscriptions")) return toast(t("demo.limitSubs", { count: DEMO_LIMITS.subscriptions }), "error");
    let category = s.category;
    if (newCategory?.trim()) category = newCategory.trim();
    const saved: Subscription = {
      ...s,
      name: s.name.trim(),
      category,
      updatedAt: nowIso(),
      cancelledAt: s.status === "cancelled" ? s.cancelledAt || todayKey() : "",
    };
    update((d) => ({
      ...d,
      categories: d.categories.includes(category) ? d.categories : [...d.categories, category],
      subscriptions: isNew ? [...d.subscriptions, saved] : d.subscriptions.map((x) => (x.id === saved.id ? saved : x)),
    }));
    toast(t(isNew ? "subs.added" : "subs.updated"), "success");
    onSaved(saved);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t(isNew ? "subs.newTitle" : "subs.editTitle")}
      width="sm:max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={save}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        {isNew && !s.name && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-fg-2">{t("subs.quickPick")}</span>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => {
                    const category = defaultCategories()[p.category];
                    set({ name: p.name, url: p.url, category: data.categories.includes(category) ? category : s.category });
                  }}
                  className="flex items-center gap-1.5 h-7.5 pl-1 pr-2.5 rounded-md border border-line-strong text-[13px] font-medium text-fg-2 hover:bg-hover hover:text-fg cursor-pointer"
                >
                  <SiteIcon url={p.url} name={p.name} size={22} className="rounded-md" />
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-6 gap-3">
          <Field label={t("subs.name")} className="col-span-3">
            <Input value={s.name} onChange={(e) => set({ name: e.target.value })} autoFocus={!isNew} placeholder={t("subs.namePlaceholder")} />
          </Field>
          <Field label={t("subs.plan")} className="col-span-3">
            <Input value={s.plan} onChange={(e) => set({ plan: e.target.value })} placeholder={t("subs.planPlaceholder")} />
          </Field>
          <Field label={t("subs.website")} className="col-span-3">
            <Input value={s.url} onChange={(e) => set({ url: e.target.value })} placeholder="spotify.com" spellCheck={false} />
          </Field>
          <Field label={t("subs.category")} className="col-span-3">
            {newCategory === null ? (
              <div className="flex gap-2">
                <Select value={s.category} onValueChange={(category) => set({ category })} options={data.categories.map((c) => ({ value: c, label: c }))} />
                <IconButton icon={Plus} label={t("subs.newCategory")} bordered onClick={() => setNewCategory("")} className="size-8" />
              </div>
            ) : (
              <Input value={newCategory} autoFocus placeholder={t("subs.newCategoryName")} onChange={(e) => setNewCategory(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setNewCategory(null)} />
            )}
          </Field>

          <Field label={t("subs.amount")} className="col-span-2">
            <Input type="number" min={0} step="0.01" value={Number.isNaN(s.price) ? "" : s.price} onChange={(e) => set({ price: e.target.valueAsNumber })} className="tabular-nums" />
          </Field>
          <Field label={t("subs.currency")} className="col-span-2">
            <Select
              value={s.currency}
              onValueChange={(currency) => set({ currency })}
              options={Array.from(new Set([...CURRENCIES, ...Object.keys(data.settings.rates)])).map((c) => ({ value: c, label: c }))}
            />
          </Field>
          <Field label={t("subs.cycle")} className="col-span-2">
            <Select
              value={s.cycle}
              onValueChange={(v) => set({ cycle: v as BillingCycle })}
              options={CYCLES.map((c) => ({ value: c, label: cycleLabel(c) }))}
            />
          </Field>
          {s.cycle === "custom" && (
            <Field label={t("subs.everyHowMany")} className="col-span-2">
              <Input type="number" min={1} value={s.cycleDays} onChange={(e) => set({ cycleDays: Math.max(1, e.target.valueAsNumber || 1) })} />
            </Field>
          )}

          <Field label={t("subs.status")} className="col-span-2">
            <Select
              value={s.status}
              onValueChange={(v) => set({ status: v as SubscriptionStatus })}
              options={STATUSES.map((st) => ({ value: st, label: statusLabel(st) }))}
            />
          </Field>
          <Field label={t("subs.startDate")} className="col-span-2">
            <DatePicker value={s.startDate} onChange={(startDate) => set({ startDate })} />
          </Field>
          {s.status === "trial" ? (
            <Field label={t("subs.trialEnd")} className="col-span-2">
              <DatePicker value={s.trialEndsAt} onChange={(trialEndsAt) => set({ trialEndsAt })} />
            </Field>
          ) : (
            <Field label={t("subs.next")} className="col-span-2">
              <DatePicker
                value={s.nextBillingDate}
                onChange={(nextBillingDate) => {
                  setNextTouched(true);
                  set({ nextBillingDate });
                }}
              />
            </Field>
          )}

          <Field label={t("subs.paymentCard")} className="col-span-3" hint={cards.length === 0 ? t("subs.cardHint") : undefined}>
            <Select
              value={s.cardId ?? ""}
              onValueChange={(v) => set({ cardId: v || null })}
              options={[{ value: "", label: t("common.none") }, ...cards.map((c) => ({ value: c.id, label: `${c.name} ${maskCardNumber(c.number)}` }))]}
            />
          </Field>
          <Field label={t("subs.linkedLogin")} className="col-span-3">
            <Select
              value={s.loginId ?? ""}
              onValueChange={(v) => set({ loginId: v || null })}
              options={[{ value: "", label: t("common.none") }, ...logins.map((l) => ({ value: l.id, label: l.username ? `${l.name} · ${l.username}` : l.name }))]}
            />
          </Field>

          <Field label={t("subs.reminder")} className="col-span-3" hint={t("subs.reminderHint")}>
            <Select
              value={s.reminderDays}
              onValueChange={(v) => set({ reminderDays: Number(v) })}
              options={[{ value: "-1", label: t("subs.noReminder") }, ...[0, 1, 2, 3, 5, 7, 14].map((d) => ({ value: String(d), label: d === 0 ? t("subs.onDay") : t("subs.daysBefore", { count: d }) }))]}
            />
          </Field>
          <Field label={t("subs.usage")} className="col-span-3" hint={t("subs.usageHint")}>
            <Select
              value={s.usage}
              onValueChange={(v) => set({ usage: v as SubscriptionUsage })}
              options={[{ value: "", label: usageLabel("") }, ...USAGES.map((u) => ({ value: u, label: usageLabel(u) }))]}
            />
          </Field>
          <Field label={t("item.notes")} className="col-span-6">
            <Textarea value={s.notes} onChange={(e) => set({ notes: e.target.value })} className="min-h-20" placeholder={t("subs.notesPlaceholder")} />
          </Field>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
