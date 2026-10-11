import { useEffect, useState } from "react";
import { Copy, CreditCard, Eye, EyeOff, Pencil, Plus } from "lucide-react";
import type { CardItem } from "../lib/types";
import { useVault } from "../lib/store";
import { cn, formatDate, formatMoney, groupCardNumber } from "../lib/format";
import { cycleShort, isBilling, monthlyCost, toBase } from "../lib/subscriptions";
import { newItem } from "../lib/defaults";
import { Badge, Button, Card, EmptyState, IconButton, Modal, PageHeader } from "@/components/kit";
import { CardVisual, SiteIcon, cardMonthsLeft } from "../components/visuals";
import { ItemEditor } from "./vault/ItemEditor";
import { t, tDynamic } from "@/i18n";


export function WalletPage() {
  const { data, nav, navigate, copy } = useVault();
  const s = data.settings;
  const cards = data.items.filter((i): i is CardItem => i.type === "card");
  const [selectedId, setSelectedId] = useState<string | null>(nav.focusId ?? cards[0]?.id ?? null);
  const [reveal, setReveal] = useState(false);
  const [editing, setEditing] = useState<{ item: CardItem; isNew: boolean } | null>(null);

  useEffect(() => {
    if (nav.focusId) setSelectedId(nav.focusId);
  }, [nav]);
  useEffect(() => setReveal(false), [selectedId]);

  const card = cards.find((c) => c.id === selectedId) ?? cards[0] ?? null;
  const subs = card ? data.subscriptions.filter((x) => x.cardId === card.id) : [];
  const active = subs.filter(isBilling);
  const monthly = active.reduce((sum, x) => sum + toBase(monthlyCost(x), x.currency, s), 0);
  const allPayments = subs.flatMap((x) => x.payments.map((p) => ({ ...p, sub: x }))).sort((a, b) => b.date.localeCompare(a.date));
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const last12 = allPayments.filter((p) => new Date(p.date) >= yearAgo).reduce((sum, p) => sum + toBase(p.amount, p.currency, s), 0);
  const left = card ? cardMonthsLeft(card) : null;

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title={t("wallet.title")}
        description={t("wallet.description")}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEditing({ item: newItem("card") as CardItem, isNew: true })}>
            {t("wallet.add")}
          </Button>
        }
      />
      {cards.length === 0 ? (
        <div className="mx-6 rounded-xl border border-dashed border-line-strong">
          <EmptyState icon={CreditCard} title={t("wallet.none")} description={t("wallet.noneDesc")} />
        </div>
      ) : (
        <div className="px-6 pb-8 flex flex-col gap-5">
          <div className="flex gap-4 overflow-x-auto pt-2 pb-2 -mx-1 px-1">
            {cards.map((c) => {
              const count = data.subscriptions.filter((x) => x.cardId === c.id && isBilling(x)).length;
              const selected = card?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  aria-pressed={selected}
                  className={cn(
                    "group w-72 shrink-0 cursor-pointer text-left outline-none transition-all duration-200",
                    selected ? "-translate-y-1" : "opacity-50 hover:opacity-80 focus-visible:opacity-80",
                  )}
                >
                  <CardVisual card={c} className={cn("transition-shadow", selected && "shadow-xl shadow-neutral-900/25")} />
                  <div className={cn("flex items-center justify-between mt-2.5 px-1 text-xs font-medium", selected ? "text-fg" : "text-fg-3")}>
                    <span>{tDynamic(`cardKind.${c.kind}`)}</span>
                    <span>{t("wallet.subsCount", { count })}</span>
                  </div>
                  <div className={cn("h-0.5 mx-1 mt-2 rounded-full transition-colors", selected ? "bg-fg" : "bg-transparent")} />
                </button>
              );
            })}
          </div>

          {card && (
            <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4">
              <div className="flex flex-col gap-4">
                <Card>
                  <div className="flex items-center justify-between px-4 pt-4 pb-3">
                    <h3 className="text-sm font-semibold text-fg truncate">{card.name}</h3>
                    <div className="flex gap-0.5">
                      <IconButton icon={reveal ? EyeOff : Eye} label={t(reveal ? "common.hide" : "common.show")} onClick={() => setReveal((r) => !r)} />
                      <IconButton icon={Pencil} label={t("common.edit")} onClick={() => setEditing({ item: card, isNew: false })} />
                    </div>
                  </div>
                  <div className="px-4 pb-4 flex flex-col gap-3 text-sm">
                    <Row label={t("item.cardNumber")} value={reveal ? groupCardNumber(card.number) : `•••• ${card.number.replace(/\D/g, "").slice(-4)}`} mono onCopy={() => copy(card.number.replace(/\D/g, ""), t("item.cardNumber"))} />
                    <Row label={t("item.expiry")} value={card.expMonth && card.expYear ? `${card.expMonth.padStart(2, "0")}/${card.expYear}` : "—"} mono onCopy={() => copy(`${card.expMonth}/${card.expYear.slice(-2)}`, t("item.expiry"))} />
                    <Row label={t("item.cvv")} value={reveal ? card.cvv || "—" : "•••"} mono onCopy={() => copy(card.cvv, t("item.cvv"))} />
                    <Row label={t("item.cardholder")} value={card.cardholder || "—"} onCopy={() => copy(card.cardholder, t("item.cardholder"))} />
                    {left !== null && (
                      <div className={cn("text-xs font-semibold rounded-md px-2.5 py-1.5", left < 0 ? "bg-red-500/10 text-red-700 dark:text-red-400" : left <= 2 ? "bg-amber-500/10 text-amber-800 dark:text-amber-300" : "bg-subtle text-fg-3")}>
                        {left < 0 ? t("wallet.expired") : left === 0 ? t("wallet.endsThisMonth") : t("wallet.validFor", { count: left })}
                      </div>
                    )}
                  </div>
                </Card>
                <div className="grid grid-cols-2 gap-3">
                  <Card className="p-4">
                    <div className="text-xs font-medium text-fg-3">{t("wallet.monthlyLoad")}</div>
                    <div className="text-xl font-bold text-fg mt-1 tabular-nums">{formatMoney(monthly, s.baseCurrency)}</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-xs font-medium text-fg-3">{t("wallet.last12")}</div>
                    <div className="text-xl font-bold text-fg mt-1 tabular-nums">{formatMoney(last12, s.baseCurrency)}</div>
                  </Card>
                </div>
              </div>

              <div className="flex flex-col gap-4 min-w-0">
                <Card>
                  <div className="px-4 pt-4 pb-3 text-sm font-semibold text-fg">{t("wallet.subsOnCard")}</div>
                  {subs.length === 0 ? (
                    <p className="px-4 pb-5 text-xs font-medium text-fg-3">{t("wallet.noSubs")}</p>
                  ) : (
                    <div className="px-2 pb-2">
                      {subs.map((x) => (
                        <button key={x.id} type="button" onClick={() => navigate("subscriptions", x.id)} className={cn("flex items-center gap-3 w-full px-2 py-2 rounded-lg hover:bg-hover cursor-pointer text-left", !isBilling(x) && "opacity-60")}>
                          <SiteIcon url={x.url} name={x.name} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-fg truncate">{x.name}</div>
                            <div className="text-xs font-medium text-fg-3">{isBilling(x) ? t("wallet.nextOn", { date: formatDate(x.nextBillingDate) }) : t("wallet.inactive")}</div>
                          </div>
                          <span className="text-sm font-semibold text-fg tabular-nums">
                            {formatMoney(x.price, x.currency)}
                            <span className="text-fg-3 font-medium">/{cycleShort(x.cycle)}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </Card>
                <Card>
                  <div className="px-4 pt-4 pb-3 text-sm font-semibold text-fg">{t("wallet.recent")}</div>
                  {allPayments.length === 0 ? (
                    <p className="px-4 pb-5 text-xs font-medium text-fg-3">{t("wallet.noCharges")}</p>
                  ) : (
                    <div className="border-t border-line">
                      {allPayments.slice(0, 15).map((p) => (
                        <div key={p.id} className="flex items-center gap-3 px-4 h-10 border-b border-line last:border-b-0 text-sm">
                          <span className="text-fg-3 w-32 shrink-0">{formatDate(p.date)}</span>
                          <span className="font-medium text-fg flex-1 truncate">{p.sub.name}</span>
                          {p.auto && <Badge>{t("subs.auto")}</Badge>}
                          <span className="font-semibold text-fg tabular-nums">{formatMoney(p.amount, p.currency)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}
        </div>
      )}

      {editing && (
        <Modal open onClose={() => setEditing(null)} title={t(editing.isNew ? "wallet.newCard" : "wallet.editCard")} width="sm:max-w-2xl">
          <div className="-mx-5 -my-4 h-[70vh]">
            <ItemEditor
              initial={editing.item}
              isNew={editing.isNew}
              onCancel={() => setEditing(null)}
              onSaved={(item) => {
                setEditing(null);
                setSelectedId(item.id);
              }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

function Row({ label, value, mono, onCopy }: { label: string; value: string; mono?: boolean; onCopy: () => void }) {
  return (
    <div className="group flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-fg-3">{label}</div>
        <div className={cn("text-sm text-fg truncate selectable", mono && "font-mono")}>{value}</div>
      </div>
      <IconButton icon={Copy} label={t("common.copy")} onClick={onCopy} className="opacity-0 group-hover:opacity-100" />
    </div>
  );
}
