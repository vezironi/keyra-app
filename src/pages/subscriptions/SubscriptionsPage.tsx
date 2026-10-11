import { useEffect, useMemo, useState } from "react";
import { Plus, Repeat } from "lucide-react";
import type { Subscription, SubscriptionStatus } from "../../lib/types";
import { useVault } from "../../lib/store";
import { cn, formatMoney, formatShortDate, relativeDays } from "../../lib/format";
import { STATUS_STYLE, cycleShort, statusLabel, daysUntilNext, isBilling, monthlyCost, toBase } from "../../lib/subscriptions";
import { newSubscription } from "../../lib/defaults";
import { Badge, Button, EmptyState, PageHeader, SearchInput, Segmented, Select } from "@/components/kit";
import { SiteIcon } from "../../components/visuals";
import { SubscriptionDetail } from "./SubscriptionDetail";
import { SubscriptionEditor } from "./SubscriptionEditor";
import { getLocale, t } from "@/i18n";
import { searchKey } from "@/lib/format";

type StatusFilter = "all" | SubscriptionStatus;
type Sort = "next" | "price" | "name";

export function SubscriptionsPage() {
  const { data, nav } = useVault();
  const s = data.settings;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<Sort>("next");
  const [selectedId, setSelectedId] = useState<string | null>(nav.focusId ?? null);
  const [editing, setEditing] = useState<{ sub: Subscription; isNew: boolean } | null>(null);

  useEffect(() => {
    if (nav.focusId) setSelectedId(nav.focusId);
  }, [nav]);

  const monthlyBase = (x: Subscription) => toBase(monthlyCost(x), x.currency, s);

  const list = useMemo(() => {
    const q = searchKey(query.trim());
    const out = data.subscriptions.filter(
      (x) =>
        (status === "all" || x.status === status) &&
        (!category || x.category === category) &&
        (!q || searchKey(`${x.name} ${x.plan} ${x.category} ${x.url}`).includes(q)),
    );
    return out.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, getLocale());
      if (sort === "price") return monthlyBase(b) - monthlyBase(a);
      // Billing ones by date first, then paused/cancelled.
      return Number(isBilling(b)) - Number(isBilling(a)) || a.nextBillingDate.localeCompare(b.nextBillingDate);
    });
  }, [data.subscriptions, query, status, category, sort, s]);

  const billing = data.subscriptions.filter(isBilling);
  const monthly = billing.reduce((sum, x) => sum + monthlyBase(x), 0);
  const selected = data.subscriptions.find((x) => x.id === selectedId) ?? null;
  const usedCategories = Array.from(new Set(data.subscriptions.map((x) => x.category))).sort((a, b) => a.localeCompare(b, "tr"));

  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <PageHeader
          title={t("subs.title")}
          description={t("subs.summary", { count: billing.length, monthly: formatMoney(monthly, s.baseCurrency), yearly: formatMoney(monthly * 12, s.baseCurrency) })}
          actions={
            <Button variant="primary" icon={Plus} onClick={() => setEditing({ sub: newSubscription(s.baseCurrency, data.categories[0]), isNew: true })}>
              {t("subs.add")}
            </Button>
          }
        />
        <div className="flex items-center gap-2 px-6 pb-3 flex-wrap">
          <Segmented<StatusFilter>
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: t("subs.filter.all") },
              { value: "active", label: t("subs.filter.active") },
              { value: "trial", label: t("subs.filter.trial") },
              { value: "paused", label: t("subs.filter.paused") },
              { value: "cancelled", label: t("subs.filter.cancelled") },
            ]}
          />
          <Select
            value={category}
            onValueChange={setCategory}
            className="w-44"
            options={[{ value: "", label: t("subs.allCategories") }, ...usedCategories.map((c) => ({ value: c, label: c }))]}
          />
          <Select
            value={sort}
            onValueChange={(v) => setSort(v as Sort)}
            className="w-52"
            options={[
              { value: "next", label: t("subs.sort.next") },
              { value: "price", label: t("subs.sort.price") },
              { value: "name", label: t("subs.sort.name") },
            ]}
          />
          <div className="min-w-48 flex-1 max-w-xs ml-auto">
            <SearchInput value={query} onChange={setQuery} placeholder={t("subs.search")} />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
          {list.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-strong">
              <EmptyState
                icon={Repeat}
                title={t(data.subscriptions.length ? "subs.noMatch" : "subs.none")}
                description={t("subs.emptyDesc")}
                action={
                  !data.subscriptions.length && (
                    <Button variant="primary" icon={Plus} onClick={() => setEditing({ sub: newSubscription(s.baseCurrency, data.categories[0]), isNew: true })}>
                      {t("subs.addFirst")}
                    </Button>
                  )
                }
              />
            </div>
          ) : (
            <div className="rounded-xl border border-line overflow-hidden">
              <div className="grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)] gap-3 px-4 h-9 items-center bg-subtle/60 border-b border-line text-[11px] font-semibold uppercase tracking-wide text-fg-3">
                <span>{t("subs.col.service")}</span>
                <span>{t("subs.col.status")}</span>
                <span>{t("subs.col.next")}</span>
                <span className="text-right">{t("subs.col.amount")}</span>
              </div>
              {list.map((x) => {
                const days = daysUntilNext(x);
                const soon = isBilling(x) && days <= 3;
                return (
                  <button
                    key={x.id}
                    type="button"
                    onClick={() => setSelectedId(x.id)}
                    className={cn(
                      "grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)] gap-3 items-center w-full px-4 py-2.5 border-b border-line last:border-b-0 text-left cursor-pointer transition-colors",
                      x.id === selectedId ? "bg-hover" : "hover:bg-hover/60",
                      !isBilling(x) && "opacity-60",
                    )}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <SiteIcon url={x.url} name={x.name} />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-fg truncate">{x.name}</span>
                        <span className="block text-xs font-medium text-fg-3 truncate">
                          {x.category}
                          {x.plan && ` · ${x.plan}`}
                        </span>
                      </span>
                    </span>
                    <span>
                      <Badge className={STATUS_STYLE[x.status]}>{statusLabel(x.status)}</Badge>
                    </span>
                    <span className="min-w-0">
                      {isBilling(x) ? (
                        <>
                          <span className="block text-sm font-medium text-fg">{formatShortDate(x.nextBillingDate)}</span>
                          <span className={cn("block text-xs font-medium", soon ? "text-amber-600 dark:text-amber-400" : "text-fg-3")}>{relativeDays(days)}</span>
                        </>
                      ) : (
                        <span className="text-sm text-fg-4">—</span>
                      )}
                    </span>
                    <span className="text-right">
                      <span className="block text-sm font-semibold text-fg tabular-nums">
                        {formatMoney(x.price, x.currency)}
                        <span className="text-fg-3 font-medium">/{cycleShort(x.cycle)}</span>
                      </span>
                      {(x.cycle !== "monthly" || x.currency !== s.baseCurrency) && (
                        <span className="block text-xs font-medium text-fg-3 tabular-nums">{t("subs.approxMonthly", { value: formatMoney(monthlyBase(x), s.baseCurrency) })}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="w-[420px] shrink-0 border-l border-line min-h-0 animate-in fade-in-0">
          <SubscriptionDetail key={selected.id} sub={selected} onEdit={() => setEditing({ sub: selected, isNew: false })} onClose={() => setSelectedId(null)} />
        </div>
      )}

      {editing && (
        <SubscriptionEditor
          initial={editing.sub}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null);
            setSelectedId(saved.id);
          }}
        />
      )}
    </div>
  );
}
