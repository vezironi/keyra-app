import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Check, ChartColumn, CircleHelp, CreditCard, PiggyBank, Table2, XCircle } from "lucide-react";
import type { CardItem, Subscription, SubscriptionUsage } from "../lib/types";
import { useVault } from "../lib/store";
import { cn, formatMoney, formatMonth, formatPercent, maskCardNumber, nowIso, todayKey } from "../lib/format";
import { isUnused, needsUsageReview, reportYears, yearReport, yearlyCost } from "../lib/reports";
import { USAGES, usageLabel } from "../lib/subscriptions";
import { Button, Card, CardHeader, EmptyState, PageHeader, Select } from "@/components/kit";
import { MiniCard, SiteIcon } from "../components/visuals";
import { t } from "@/i18n";

export function ReportsPage() {
  const { data, update, navigate } = useVault();
  const s = data.settings;
  const years = useMemo(() => reportYears(data.subscriptions), [data.subscriptions]);
  const [year, setYear] = useState(years[0]);

  const now = new Date();
  const isCurrent = year === now.getFullYear();
  // Compare like with like: for the current year, only the months that have passed so far.
  const monthsSoFar = isCurrent ? now.getMonth() + 1 : 12;

  const report = useMemo(() => yearReport(data.subscriptions, s, year), [data.subscriptions, s, year]);
  const previous = useMemo(() => yearReport(data.subscriptions, s, year - 1), [data.subscriptions, s, year]);
  const prevSamePeriod = previous.months.slice(0, monthsSoFar).reduce((a, b) => a + b, 0);
  const change = prevSamePeriod ? report.total / prevSamePeriod - 1 : null;

  const unused = data.subscriptions.filter(isUnused);
  const review = data.subscriptions.filter(needsUsageReview);
  const savings = unused.reduce((sum, x) => sum + yearlyCost(x, s), 0);
  const cards = data.items.filter((i): i is CardItem => i.type === "card");

  const patchSub = (id: string, p: Partial<Subscription>) =>
    update((d) => ({ ...d, subscriptions: d.subscriptions.map((x) => (x.id === id ? { ...x, ...p, updatedAt: nowIso() } : x)) }));

  const money = (v: number) => formatMoney(v, s.baseCurrency);

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader
        title={t("reports.title")}
        description={t("reports.description", { currency: s.baseCurrency })}
        actions={<Select value={String(year)} onValueChange={(v) => setYear(Number(v))} className="w-28" options={years.map((y) => ({ value: String(y), label: String(y) }))} />}
      />
      <div className="px-6 pb-8 flex flex-col gap-4">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <Tile label={t("reports.paidIn", { year })} value={money(report.total)} sub={isCurrent ? t("reports.soFar") : t("reports.fullYear")} />
          <Tile
            label={t("reports.vsLast", { year: year - 1 })}
            value={change === null ? "—" : `${change > 0 ? "+" : ""}${formatPercent(change)}`}
            sub={t(isCurrent ? "reports.samePeriod" : "reports.lastYearTotal", { value: money(prevSamePeriod) })}
            icon={change === null ? undefined : change > 0 ? ArrowUpRight : ArrowDownRight}
          />
          <Tile label={t("reports.monthlyAvg")} value={money(report.total / monthsSoFar)} sub={t("reports.overMonths", { count: monthsSoFar })} />
          <Tile label={t("reports.savings")} value={money(savings)} sub={t("reports.savingsSub", { count: unused.length })} />
        </div>

        <MonthlyCompare year={year} current={report.months} previous={previous.months} lastMonth={isCurrent ? now.getMonth() : 11} currency={s.baseCurrency} />

        {(unused.length > 0 || review.length > 0) && (
          <Card>
            <CardHeader title={t("reports.savingsTitle")} description={t("reports.savingsDesc")} />
            <div className="px-2 pb-2">
              {unused.map((x) => (
                <div key={x.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-hover">
                  <SiteIcon url={x.url} name={x.name} />
                  <button type="button" onClick={() => navigate("subscriptions", x.id)} className="flex-1 min-w-0 text-left cursor-pointer">
                    <div className="text-sm font-semibold text-fg truncate">{x.name}</div>
                    <div className="text-xs font-medium text-fg-3">{t("reports.usageIs", { usage: usageLabel(x.usage) })}</div>
                  </button>
                  <span className="text-sm font-semibold text-fg tabular-nums">{t("reports.perYear", { value: money(yearlyCost(x, s)) })}</span>
                  <Button size="sm" icon={Check} onClick={() => patchSub(x.id, { usage: "often" })}>
                    {t("reports.keep")}
                  </Button>
                  <Button size="sm" variant="danger" icon={XCircle} onClick={() => patchSub(x.id, { status: "cancelled", cancelledAt: todayKey() })}>
                    {t("reports.cancel")}
                  </Button>
                </div>
              ))}
              {review.length > 0 && (
                <>
                  <div className="flex items-center gap-2 px-2 pt-3 pb-1.5 text-xs font-semibold text-fg-3">
                    <CircleHelp size={13} /> {t("reports.reviewTitle")}
                  </div>
                  {review.map((x) => (
                    <div key={x.id} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-hover">
                      <SiteIcon url={x.url} name={x.name} />
                      <span className="flex-1 min-w-0 text-sm font-semibold text-fg truncate">{x.name}</span>
                      <span className="text-xs font-medium text-fg-3 tabular-nums">{t("reports.perYear", { value: money(yearlyCost(x, s)) })}</span>
                      <div className="flex gap-1">
                        {USAGES.map((u) => (
                          <Button key={u} size="sm" onClick={() => patchSub(x.id, { usage: u as SubscriptionUsage })}>
                            {usageLabel(u)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </Card>
        )}

        {report.total === 0 ? (
          <Card>
            <EmptyState icon={ChartColumn} title={t("reports.noPayments", { year })} description={t("reports.noPaymentsDesc")} />
          </Card>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Card>
              <CardHeader title={t("reports.byCategory")} description={t("reports.inYear", { year })} />
              <Bars rows={report.byCategory.map((c) => ({ key: c.name, label: c.name, total: c.total }))} total={report.total} money={money} />
            </Card>
            <Card>
              <CardHeader title={t("reports.byCard")} description={t("reports.byCardDesc")} />
              <div className="px-2 pb-2">
                {report.byCard.map(({ cardId, total }) => {
                  const card = cards.find((c) => c.id === cardId);
                  return (
                    <div key={cardId ?? "none"} className="flex items-center gap-3 px-2 py-2">
                      {card ? <MiniCard color={card.color} /> : <div className="w-8 h-8 rounded-md bg-subtle flex items-center justify-center text-fg-3"><CreditCard size={15} /></div>}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-fg truncate">{card ? card.name : t("reports.noCard")}</div>
                        {card && <div className="text-xs font-medium text-fg-3">{maskCardNumber(card.number)}</div>}
                      </div>
                      <span className="text-sm font-semibold text-fg tabular-nums">{money(total)}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card>
              <CardHeader title={t("reports.top")} description={t("reports.inYear", { year })} />
              <div className="px-2 pb-2">
                {report.bySub.slice(0, 6).map(({ sub, total }) => (
                  <button key={sub.id} type="button" onClick={() => navigate("subscriptions", sub.id)} className="flex items-center gap-3 w-full px-2 py-2 rounded-lg hover:bg-hover cursor-pointer text-left">
                    <SiteIcon url={sub.url} name={sub.name} />
                    <span className="flex-1 min-w-0 text-sm font-semibold text-fg truncate">{sub.name}</span>
                    <span className="text-sm font-semibold text-fg tabular-nums">{money(total)}</span>
                  </button>
                ))}
              </div>
            </Card>
          </div>
        )}

        {savings === 0 && review.length === 0 && unused.length === 0 && data.subscriptions.length > 0 && (
          <p className="flex items-center gap-2 text-xs font-medium text-fg-3 px-1">
            <PiggyBank size={14} /> {t("reports.usageTip")}
          </p>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon?: typeof ArrowUpRight }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs font-medium text-fg-3">{label}</div>
      <div className="flex items-center gap-1.5 text-2xl font-bold text-fg tracking-tight mt-1 tabular-nums truncate">
        {Icon && <Icon size={20} className="text-fg-3 shrink-0" />}
        {value}
      </div>
      {sub && <div className="text-xs font-medium text-fg-3 mt-1 truncate">{sub}</div>}
    </div>
  );
}

/** Single-series magnitude bars (neutral); the value and share are always printed. */
function Bars({ rows, total, money }: { rows: { key: string; label: string; total: number }[]; total: number; money: (v: number) => string }) {
  const max = rows[0]?.total || 1;
  return (
    <div className="px-4 pb-4 flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.key} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3">
          <span className="text-[13px] font-medium text-fg-2 truncate">{r.label}</span>
          <div className="h-2.5 rounded-full bg-subtle overflow-hidden">
            <div className="h-full rounded-full bg-bar" style={{ width: `${Math.max(2, (r.total / max) * 100)}%` }} />
          </div>
          <span className="text-[13px] font-semibold text-fg text-right tabular-nums">
            {money(r.total)}
            <span className="text-fg-4 font-medium ml-1">{formatPercent(r.total / total)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Grouped columns: each month of `year` beside the same month a year earlier. */
function MonthlyCompare({ year, current, previous, lastMonth, currency }: { year: number; current: number[]; previous: number[]; lastMonth: number; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(...current, ...previous, 1);
  const W = 720;
  const H = 200;
  const pad = { l: 8, r: 8, t: 12 };
  const slot = (W - pad.l - pad.r) / 12;
  const barW = Math.min(18, slot * 0.3);
  const gap = 2;
  const base = H;
  const y = (v: number) => pad.t + (H - pad.t) * (1 - v / max);
  const monthKey = (m: number) => `${year}-${String(m + 1).padStart(2, "0")}`;

  const bar = (x: number, v: number) => {
    const top = y(v);
    const h = base - top;
    if (h <= 0.5) return "";
    const r = Math.min(4, h);
    return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z`;
  };

  return (
    <Card>
      <CardHeader
        title={t("reports.monthly")}
        description={t("reports.monthlyDesc", { year, prev: year - 1 })}
        action={
          <Button size="sm" variant="ghost" icon={asTable ? ChartColumn : Table2} onClick={() => setAsTable((v) => !v)}>
            {t(asTable ? "reports.showChart" : "reports.showTable")}
          </Button>
        }
      />
      {asTable ? (
        <div className="px-4 pb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-fg-3 text-right">
                <th className="text-left font-semibold py-1.5">{t("reports.month")}</th>
                <th className="font-semibold">{year}</th>
                <th className="font-semibold">{year - 1}</th>
                <th className="font-semibold">{t("reports.difference")}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {current.map((v, m) => (
                <tr key={m} className="border-t border-line text-right">
                  <td className="text-left py-1.5 text-fg-2">{formatMonth(monthKey(m), "long")}</td>
                  <td className="font-semibold text-fg">{formatMoney(v, currency)}</td>
                  <td className="text-fg-2">{formatMoney(previous[m], currency)}</td>
                  <td className="text-fg-2">{formatMoney(v - previous[m], currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-4 pb-4">
          <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t("reports.monthly")}>
              {[0.25, 0.5, 0.75, 1].map((g) => (
                <line key={g} x1={pad.l} x2={W - pad.r} y1={y(max * g)} y2={y(max * g)} stroke="var(--line)" strokeDasharray="2 4" />
              ))}
              <line x1={pad.l} x2={W - pad.r} y1={base - 0.5} y2={base - 0.5} stroke="var(--line)" />
              {current.map((v, m) => {
                const cx = pad.l + slot * m + slot / 2;
                const dim = hover !== null && hover !== m ? 0.5 : 1;
                return (
                  <g key={m} onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)}>
                    <rect x={cx - slot / 2} y={0} width={slot} height={H} fill={hover === m ? "var(--hover)" : "transparent"} />
                    <path d={bar(cx - barW - gap / 2, v)} fill="var(--series-1)" opacity={dim} />
                    <path d={bar(cx + gap / 2, previous[m])} fill="var(--series-2)" opacity={dim} />
                  </g>
                );
              })}
            </svg>
            {hover !== null && (
              <div
                className="absolute pointer-events-none -translate-x-1/2 -translate-y-full px-2.5 py-1.5 rounded-md bg-primary text-primary-fg text-xs font-medium shadow-lg whitespace-nowrap"
                style={{ left: `${((pad.l + slot * hover + slot / 2) / W) * 100}%`, top: `${(y(Math.max(current[hover], previous[hover])) / H) * 100}%` }}
              >
                <div className="font-semibold">{formatMonth(monthKey(hover), "long")}</div>
                <div className="flex items-center gap-1.5 tabular-nums">
                  <span className="w-2 h-2 rounded-sm bg-series-1" /> {year}: <span className="font-semibold">{formatMoney(current[hover], currency)}</span>
                  {hover > lastMonth && <span className="opacity-70">· {t("reports.notYet")}</span>}
                </div>
                <div className="flex items-center gap-1.5 tabular-nums">
                  <span className="w-2 h-2 rounded-sm bg-series-2" /> {year - 1}: <span className="font-semibold">{formatMoney(previous[hover], currency)}</span>
                </div>
              </div>
            )}
          </div>
          <div className="grid mt-1.5" style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))", paddingInline: `${(pad.l / W) * 100}%` }}>
            {current.map((_, m) => (
              <span key={m} onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)} className={cn("text-center text-[11px] truncate", m === lastMonth ? "font-bold text-fg" : "font-medium text-fg-3")}>
                {formatMonth(monthKey(m))}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs font-medium text-fg-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-series-1" /> {year}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-series-2" /> {year - 1}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
