import { useState } from "react";
import { BadgeCheck, CalendarClock, Copy, CreditCard, ExternalLink, Pause, Pencil, Play, Plus, Trash2, X, XCircle } from "lucide-react";
import type { CardItem, LoginItem, Payment, Subscription, SubscriptionUsage } from "../../lib/types";
import { useVault } from "../../lib/store";
import { cn, formatDate, formatMoney, maskCardNumber, nowIso, relativeDays, todayKey, uid } from "../../lib/format";
import { STATUS_STYLE, cycleLabel, cycleShort, statusLabel, addCycles, daysUntilNext, isBilling, monthlyCost, toBase, totalPaid, USAGES, usageLabel } from "../../lib/subscriptions";
import { Badge, Button, ConfirmModal, IconButton, Input, Segmented } from "@/components/kit";
import { MiniCard, SiteIcon } from "../../components/visuals";
import { openExternal } from "../vault/ItemDetail";
import { t } from "@/i18n";

export function SubscriptionDetail({ sub, onEdit, onClose }: { sub: Subscription; onEdit: () => void; onClose: () => void }) {
  const { data, update, navigate, copy, toast } = useVault();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [paymentDraft, setPaymentDraft] = useState<{ date: string; amount: number } | null>(null);
  const card = data.items.find((i): i is CardItem => i.id === sub.cardId && i.type === "card");
  const login = data.items.find((i): i is LoginItem => i.id === sub.loginId && i.type === "login");
  const s = data.settings;
  const days = daysUntilNext(sub);

  const patch = (p: Partial<Subscription>) =>
    update((d) => ({ ...d, subscriptions: d.subscriptions.map((x) => (x.id === sub.id ? { ...x, ...p, updatedAt: nowIso() } : x)) }));

  /** Records the upcoming charge as paid now and moves the billing date one cycle forward. */
  const markPaid = () => {
    const payment: Payment = { id: uid(), date: todayKey(), amount: sub.price, currency: sub.currency, note: "", auto: false };
    patch({
      payments: [...sub.payments, payment],
      nextBillingDate: addCycles(sub.nextBillingDate, sub),
      status: sub.status === "trial" ? "active" : sub.status,
    });
    toast(t("subs.paidToast"), "success");
  };

  const addPayment = () => {
    if (!paymentDraft || !(paymentDraft.amount >= 0) || !paymentDraft.date) return;
    patch({ payments: [...sub.payments, { id: uid(), date: paymentDraft.date, amount: paymentDraft.amount, currency: sub.currency, note: "", auto: false }] });
    setPaymentDraft(null);
  };

  const remove = () => {
    update((d) => ({ ...d, subscriptions: d.subscriptions.filter((x) => x.id !== sub.id) }));
    toast(t("subs.deleted"));
    onClose();
  };

  const payments = [...sub.payments].sort((a, b) => b.date.localeCompare(a.date));
  const paid = totalPaid(sub, s);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-line shrink-0">
        <SiteIcon url={sub.url} name={sub.name} size={36} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-fg truncate">{sub.name}</h2>
          <div className="text-xs font-medium text-fg-3 truncate">
            {sub.category}
            {sub.plan && ` · ${sub.plan}`}
          </div>
        </div>
        <IconButton icon={Trash2} label={t("common.delete")} onClick={() => setConfirmDelete(true)} className="hover:text-red-600" />
        <Button size="sm" icon={Pencil} onClick={onEdit}>
          {t("common.edit")}
        </Button>
        <IconButton icon={X} label={t("common.close")} onClick={onClose} />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-3xl font-bold text-fg tracking-tight tabular-nums">{formatMoney(sub.price, sub.currency)}</div>
            <div className="text-sm font-medium text-fg-3 mt-0.5">
              {cycleLabel(sub.cycle)}
              {sub.cycle === "custom" && ` ${t("subs.everyDays", { days: sub.cycleDays })}`}
              {sub.currency !== s.baseCurrency && ` · ≈ ${formatMoney(toBase(sub.price, sub.currency, s), s.baseCurrency)}`}
            </div>
          </div>
          <Badge className={STATUS_STYLE[sub.status]}>{statusLabel(sub.status)}</Badge>
        </div>

        {isBilling(sub) && (
          <div className={cn("flex items-center gap-3 rounded-xl border p-3.5", days <= 3 ? "border-amber-500/30 bg-amber-500/5" : "border-line bg-surface")}>
            <CalendarClock size={18} className={days <= 3 ? "text-amber-600" : "text-fg-3"} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-fg">{t(sub.status === "trial" ? "subs.trialEnds" : "subs.nextPayment", { date: formatDate(sub.nextBillingDate) })}</div>
              <div className="text-xs font-medium text-fg-3">{relativeDays(days)}</div>
            </div>
            <Button size="sm" icon={BadgeCheck} onClick={markPaid} title={t("subs.markPaidHint")}>
              {t("subs.markPaid")}
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Stat label={t("subs.avgMonthly")} value={formatMoney(toBase(monthlyCost(sub), sub.currency, s), s.baseCurrency)} />
          <Stat label={t("subs.yearlyCost")} value={formatMoney(toBase(monthlyCost(sub) * 12, sub.currency, s), s.baseCurrency)} />
          <Stat label={t("subs.totalPaid")} value={formatMoney(paid, s.baseCurrency)} />
          <Stat label={t("subs.since")} value={formatDate(sub.startDate)} />
        </div>

        {isBilling(sub) && (
          <div className="flex flex-col gap-1.5">
            <h4 className="text-xs font-semibold text-fg-3 px-1">{t("subs.usageQuestion")}</h4>
            <Segmented<SubscriptionUsage>
              className="w-full"
              value={sub.usage}
              onChange={(usage) => patch({ usage: usage === sub.usage ? "" : usage })}
              options={USAGES.map((u) => ({ value: u, label: usageLabel(u) }))}
            />
            {(sub.usage === "rarely" || sub.usage === "never") && (
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400 px-1">
                {t("subs.usageSavings", { value: formatMoney(toBase(monthlyCost(sub) * 12, sub.currency, s), s.baseCurrency) })}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {sub.status === "active" && (
            <Button size="sm" icon={Pause} onClick={() => patch({ status: "paused" })}>
              {t("subs.pause")}
            </Button>
          )}
          {(sub.status === "paused" || sub.status === "cancelled") && (
            <Button
              size="sm"
              icon={Play}
              onClick={() => {
                const today = todayKey();
                let next = sub.nextBillingDate || today;
                for (let i = 0; i < 1000 && next < today; i++) next = addCycles(next, sub);
                patch({ status: "active", cancelledAt: "", nextBillingDate: next });
              }}
            >
              {t("subs.resume")}
            </Button>
          )}
          {sub.status !== "cancelled" && (
            <Button size="sm" icon={XCircle} onClick={() => patch({ status: "cancelled", cancelledAt: todayKey() })}>
              {t("subs.markCancelled")}
            </Button>
          )}
          {sub.url && (
            <Button size="sm" icon={ExternalLink} onClick={() => openExternal(sub.url)}>
              {t("subs.visit")}
            </Button>
          )}
        </div>

        {(card || login) && (
          <div className="rounded-xl border border-line bg-surface overflow-hidden">
            {card && (
              <button type="button" onClick={() => navigate("wallet", card.id)} className="flex items-center gap-3 w-full px-4 py-2.5 border-b border-line last:border-b-0 hover:bg-hover cursor-pointer text-left">
                <MiniCard color={card.color} size={30} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-fg-3">{t("subs.paymentCard")}</div>
                  <div className="text-sm font-medium text-fg truncate">
                    {card.name} <span className="text-fg-3">{maskCardNumber(card.number)}</span>
                  </div>
                </div>
                <CreditCard size={15} className="text-fg-4" />
              </button>
            )}
            {login && (
              <div className="flex items-center gap-3 px-4 py-2.5">
                <SiteIcon url={login.urls[0]} name={login.name} size={30} />
                <button type="button" onClick={() => navigate("vault", login.id)} className="flex-1 min-w-0 text-left cursor-pointer">
                  <div className="text-xs font-medium text-fg-3">{t("subs.linkedAccount")}</div>
                  <div className="text-sm font-medium text-fg truncate hover:underline">{login.username || login.name}</div>
                </button>
                <Button size="sm" icon={Copy} onClick={() => copy(login.password, t("common.password"))}>
                  {t("common.password")}
                </Button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between px-1">
            <h4 className="text-xs font-semibold text-fg-3">{t("subs.history", { count: payments.length })}</h4>
            <button type="button" onClick={() => setPaymentDraft({ date: todayKey(), amount: sub.price })} className="flex items-center gap-1 text-xs font-semibold text-fg-2 hover:text-fg cursor-pointer">
              <Plus size={13} /> {t("subs.addPayment")}
            </button>
          </div>
          <div className="rounded-xl border border-line bg-surface overflow-hidden">
            {paymentDraft && (
              <div className="flex items-center gap-2 p-2 border-b border-line bg-subtle/50">
                <Input type="date" value={paymentDraft.date} onChange={(e) => setPaymentDraft({ ...paymentDraft, date: e.target.value })} className="h-8" />
                <Input type="number" step="0.01" value={paymentDraft.amount} onChange={(e) => setPaymentDraft({ ...paymentDraft, amount: e.target.valueAsNumber })} className="h-8 w-28" />
                <Button size="sm" variant="primary" onClick={addPayment}>
                  {t("common.add")}
                </Button>
                <IconButton icon={X} label={t("common.cancel")} onClick={() => setPaymentDraft(null)} />
              </div>
            )}
            {payments.length === 0 && !paymentDraft ? (
              <p className="px-4 py-6 text-center text-xs font-medium text-fg-3">{t("subs.noPayments")}</p>
            ) : (
              payments.map((p) => (
                <div key={p.id} className="group flex items-center gap-3 px-4 h-10 border-b border-line last:border-b-0 text-sm">
                  <span className="text-fg-2 flex-1">{formatDate(p.date)}</span>
                  {p.auto && <Badge>{t("subs.auto")}</Badge>}
                  <span className="font-semibold text-fg tabular-nums">{formatMoney(p.amount, p.currency)}</span>
                  <IconButton
                    icon={Trash2}
                    label={t("subs.deletePayment")}
                    onClick={() => patch({ payments: sub.payments.filter((x) => x.id !== p.id) })}
                    className="opacity-0 group-hover:opacity-100 w-6 h-6 hover:text-red-600"
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {sub.notes && (
          <div className="flex flex-col gap-1.5">
            <h4 className="text-xs font-semibold text-fg-3 px-1">{t("item.notes")}</h4>
            <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-fg whitespace-pre-wrap selectable">{sub.notes}</p>
          </div>
        )}
        <p className="text-[11px] font-medium text-fg-4 px-1">
          {cycleLabel(sub.cycle)} · {formatMoney(sub.price, sub.currency)}/{cycleShort(sub.cycle)}
          {sub.cancelledAt && t("subs.cancelledOn", { date: formatDate(sub.cancelledAt) })}
        </p>
      </div>

      <ConfirmModal
        open={confirmDelete}
        title={t("subs.deleteTitle")}
        message={
t("subs.deleteBody", { name: sub.name })
        }
        onConfirm={remove}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-3.5 py-2.5">
      <div className="text-xs font-medium text-fg-3">{label}</div>
      <div className="text-sm font-semibold text-fg mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}
