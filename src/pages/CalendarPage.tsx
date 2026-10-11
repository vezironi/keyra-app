import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Subscription } from "../lib/types";
import { useVault } from "../lib/store";
import { cn, formatDate, formatMoney, formatMonth, toDateKey, todayKey } from "../lib/format";
import { isBilling, occurrencesBetween, toBase } from "../lib/subscriptions";
import { Button, Card, IconButton, PageHeader } from "@/components/kit";
import { SiteIcon } from "../components/visuals";
import { getLocale, t } from "@/i18n";

/** Monday-first short weekday names in the UI language (Jan 1 2024 was a Monday). */
const weekdays = () => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(getLocale(), { weekday: "short" }).format(new Date(2024, 0, 1 + i)));

interface Entry {
  sub: Subscription;
  amount: number;
  currency: string;
  paid: boolean;
}

export function CalendarPage() {
  const { data, navigate } = useVault();
  const s = data.settings;
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(todayKey());

  const first = cursor;
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const fromKey = toDateKey(first);
  const toKey = toDateKey(last);
  const today = todayKey();

  /** Past days show recorded payments; today onward shows projected charges. */
  const byDay = useMemo(() => {
    const map = new Map<string, Entry[]>();
    const add = (key: string, e: Entry) => map.set(key, [...(map.get(key) ?? []), e]);
    for (const sub of data.subscriptions) {
      for (const p of sub.payments) if (p.date >= fromKey && p.date <= toKey) add(p.date, { sub, amount: p.amount, currency: p.currency, paid: true });
      if (isBilling(sub))
        for (const date of occurrencesBetween(sub, fromKey < today ? today : fromKey, toKey)) add(date, { sub, amount: sub.price, currency: sub.currency, paid: false });
    }
    return map;
  }, [data.subscriptions, fromKey, toKey, today]);

  const monthTotal = [...byDay.values()].flat().reduce((sum, e) => sum + toBase(e.amount, e.currency, s), 0);
  const paidTotal = [...byDay.values()].flat().filter((e) => e.paid).reduce((sum, e) => sum + toBase(e.amount, e.currency, s), 0);

  // Monday-first grid.
  const lead = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: last.getDate() }, (_, i) => toDateKey(new Date(first.getFullYear(), first.getMonth(), i + 1))),
  ];
  while (cells.length % 7) cells.push(null);

  const shift = (n: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1));
  const selectedEntries = selectedDay ? byDay.get(selectedDay) ?? [] : [];

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title={t("cal.title")}
        description={t("cal.summary", { month: formatMonth(fromKey, "long"), total: formatMoney(monthTotal, s.baseCurrency), paid: formatMoney(paidTotal, s.baseCurrency) })}
        actions={
          <>
            <IconButton icon={ChevronLeft} label={t("cal.prev")} bordered onClick={() => shift(-1)} />
            <Button
              size="sm"
              onClick={() => {
                const d = new Date();
                setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
                setSelectedDay(todayKey());
              }}
            >
              {t("cal.today")}
            </Button>
            <IconButton icon={ChevronRight} label={t("cal.next")} bordered onClick={() => shift(1)} />
          </>
        }
      />
      <div className="px-6 pb-8 grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4">
        <Card className="overflow-hidden">
          <div className="px-4 pt-4 pb-2 text-base font-bold text-fg capitalize">{formatMonth(fromKey, "long")}</div>
          <div className="grid grid-cols-7 border-b border-line">
            {weekdays().map((d) => (
              <div key={d} className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-fg-3">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((key, i) => {
              if (!key) return <div key={i} className="min-h-24 border-b border-r border-line bg-subtle/30 [&:nth-child(7n)]:border-r-0" />;
              const entries = byDay.get(key) ?? [];
              const dayNum = Number(key.slice(8));
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDay(key)}
                  className={cn(
                    "min-h-24 p-1.5 border-b border-r border-line [&:nth-child(7n)]:border-r-0 text-left flex flex-col gap-1 cursor-pointer transition-colors",
                    selectedDay === key ? "bg-hover" : "hover:bg-hover/50",
                  )}
                >
                  <span
                    className={cn(
                      "w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold",
                      key === today ? "bg-primary text-primary-fg" : key < today ? "text-fg-4" : "text-fg-2",
                    )}
                  >
                    {dayNum}
                  </span>
                  {entries.slice(0, 3).map((e, j) => (
                    <span
                      key={j}
                      className={cn(
                        "flex items-center gap-1 px-1 h-5 rounded text-[11px] font-semibold truncate",
                        e.paid ? "text-fg-3 line-through decoration-fg-4/50" : "bg-subtle text-fg",
                      )}
                      title={`${e.sub.name} · ${formatMoney(e.amount, e.currency)}`}
                    >
                      <SiteIcon url={e.sub.url} name={e.sub.name} size={14} className="rounded-sm" />
                      <span className="truncate">{e.sub.name}</span>
                    </span>
                  ))}
                  {entries.length > 3 && <span className="text-[10px] font-semibold text-fg-3 px-1">{t("cal.more", { count: entries.length - 3 })}</span>}
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="self-start">
          <div className="px-4 pt-4 pb-3 border-b border-line">
            <div className="text-sm font-semibold text-fg">{selectedDay ? formatDate(selectedDay) : t("cal.pickDay")}</div>
            <div className="text-xs font-medium text-fg-3 mt-0.5">
              {selectedEntries.length ? t("cal.dayTotal", { count: selectedEntries.length, total: formatMoney(selectedEntries.reduce((sum, e) => sum + toBase(e.amount, e.currency, s), 0), s.baseCurrency) }) : t("cal.noPayments")}
            </div>
          </div>
          <div className="p-2">
            {selectedEntries.map((e, i) => (
              <button key={i} type="button" onClick={() => navigate("subscriptions", e.sub.id)} className="flex items-center gap-3 w-full px-2 py-2 rounded-lg hover:bg-hover cursor-pointer text-left">
                <SiteIcon url={e.sub.url} name={e.sub.name} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-fg truncate">{e.sub.name}</div>
                  <div className="text-xs font-medium text-fg-3">{t(e.paid ? "cal.paid" : "cal.planned")}</div>
                </div>
                <span className="text-sm font-semibold text-fg tabular-nums">{formatMoney(e.amount, e.currency)}</span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
