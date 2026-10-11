import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, CreditCard, Plus, ShieldCheck, Sparkles, Vault } from "lucide-react";
import type { CardItem, Subscription } from "../lib/types";
import { useVault } from "../lib/store";
import { cn, daysBetween, formatMoney, formatMonth, formatPercent, formatShortDate, maskCardNumber, relativeDays, toDateKey, todayKey } from "../lib/format";
import { daysUntilNext, isBilling, monthlyCost, occurrencesBetween, spendingByMonth, toBase } from "../lib/subscriptions";
import { analyze } from "../lib/security";
import { isUnused, yearlyCost } from "../lib/reports";
import { Button, Card, CardHeader, EmptyState, PageHeader } from "@/components/kit";
import { MiniCard, SiteIcon } from "../components/visuals";
import { t } from "@/i18n";


function StatTile({ label, value, sub, onClick }: { label: string; value: string; sub?: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="text-left rounded-xl border border-line bg-surface p-4 enabled:hover:border-line-strong enabled:cursor-pointer transition-colors">
      <div className="text-xs font-medium text-fg-3">{label}</div>
      <div className="text-2xl font-bold text-fg tracking-tight mt-1 tabular-nums truncate">{value}</div>
      {sub && <div className="text-xs font-medium text-fg-3 mt-1 truncate">{sub}</div>}
    </button>
  );
}

export function Dashboard() {
  const { data, navigate } = useVault();
  const s = data.settings;
  const subs = data.subscriptions;
  const billing = subs.filter(isBilling);
  const report = useMemo(() => analyze(data), [data]);

  const monthly = billing.reduce((sum, x) => sum + toBase(monthlyCost(x), x.currency, s), 0);

  const today = todayKey();
  const now = new Date();
  const monthEnd = toDateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const in30 = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30));

  const upcoming = billing
    .flatMap((x) => occurrencesBetween(x, today, in30).map((date) => ({ sub: x, date })))
    .sort((a, b) => a.date.localeCompare(b.date));
  const leftThisMonth = upcoming.filter((u) => u.date <= monthEnd).reduce((sum, u) => sum + toBase(u.sub.price, u.sub.currency, s), 0);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const x of billing) map.set(x.category, (map.get(x.category) ?? 0) + toBase(monthlyCost(x), x.currency, s));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [billing, s]);

  // 6 months of recorded payments + 6 months projected from current subscriptions.
  const timeline = useMemo(() => {
    const past = spendingByMonth(subs, s, 6).map((b) => ({ ...b, projected: false }));
    const future = Array.from({ length: 6 }, (_, i) => {
      const start = new Date(now.getFullYear(), now.getMonth() + 1 + i, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      const total = billing.reduce((sum, x) => sum + occurrencesBetween(x, toDateKey(start), toDateKey(end)).length * toBase(x.price, x.currency, s), 0);
      return { key: toDateKey(start).slice(0, 7), total, projected: true };
    });
    // The current month mixes paid + still-due charges.
    past[past.length - 1].total += leftThisMonth;
    return [...past, ...future];
  }, [subs, billing, s, leftThisMonth]);

  const trialsEnding = subs.filter((x) => x.status === "trial" && daysUntilNext(x) <= 7);
  const cards = data.items.filter((i): i is CardItem => i.type === "card");
  const perCard = cards
    .map((c) => ({ card: c, total: billing.filter((x) => x.cardId === c.id).reduce((sum, x) => sum + toBase(monthlyCost(x), x.currency, s), 0), count: billing.filter((x) => x.cardId === c.id).length }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.total - a.total);

  const unused = subs.filter(isUnused);
  const alerts: { tone: "warn" | "danger"; text: string; onClick: () => void }[] = [
    ...(report.breached.length ? [{ tone: "danger" as const, text: t("dash.alert.breached", { count: report.breached.length }), onClick: () => navigate("security") }] : []),
    ...trialsEnding.map((x) => ({ tone: "warn" as const, text: t("dash.alert.trial", { name: x.name, when: relativeDays(daysUntilNext(x)) }), onClick: () => navigate("subscriptions", x.id) })),
    ...report.expiringCards.map((c) => ({ tone: "warn" as const, text: t("dash.alert.card", { name: c.name }), onClick: () => navigate("wallet", c.id) })),
    ...(report.weak.length ? [{ tone: "danger" as const, text: t("dash.alert.weak", { count: report.weak.length }), onClick: () => navigate("security") }] : []),
    ...(report.reused.length ? [{ tone: "danger" as const, text: t("dash.alert.reused", { count: report.reusedIds.size }), onClick: () => navigate("security") }] : []),
    ...(unused.length
      ? [
          {
            tone: "warn" as const,
            text: t("dash.alert.unused", { count: unused.length, value: formatMoney(unused.reduce((sum, x) => sum + yearlyCost(x, s), 0), s.baseCurrency) }),
            onClick: () => navigate("reports"),
          },
        ]
      : []),
  ];

  const hour = now.getHours();
  const greeting = t(hour < 6 ? "dash.greeting.night" : hour < 12 ? "dash.greeting.morning" : hour < 18 ? "dash.greeting.day" : "dash.greeting.evening");

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title={greeting} description={t("dash.summary", { month: formatMonth(today, "long"), items: data.items.length, subs: billing.length })} />
      <div className="px-6 pb-8 flex flex-col gap-4">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <StatTile label={t("dash.monthlySpend")} value={formatMoney(monthly, s.baseCurrency)} sub={t("dash.activeSubs", { count: billing.length })} onClick={() => navigate("subscriptions")} />
          <StatTile label={t("dash.yearly")} value={formatMoney(monthly * 12, s.baseCurrency)} sub={t("dash.yearlySub")} />
          <StatTile label={t("dash.leftThisMonth")} value={formatMoney(leftThisMonth, s.baseCurrency)} sub={t("dash.payments", { count: upcoming.filter((u) => u.date <= monthEnd).length })} onClick={() => navigate("calendar")} />
          <StatTile label={t("dash.health")} value={formatPercent(report.score / 100)} sub={report.logins.length ? t("dash.healthSub", { weak: report.weak.length, reused: report.reusedIds.size }) : t("dash.noLogins")} onClick={() => navigate("security")} />
        </div>

        {alerts.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {alerts.slice(0, 4).map((a, i) => (
              <button
                key={i}
                type="button"
                onClick={a.onClick}
                className={cn(
                  "flex items-center gap-2.5 px-3.5 h-10 rounded-lg text-sm font-medium cursor-pointer text-left",
                  a.tone === "danger" ? "bg-red-500/8 text-red-700 dark:text-red-400 hover:bg-red-500/12" : "bg-amber-500/8 text-amber-800 dark:text-amber-300 hover:bg-amber-500/12",
                )}
              >
                <AlertTriangle size={15} className="shrink-0" />
                <span className="flex-1 truncate">{a.text}</span>
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
          <Card className="xl:col-span-3">
            <CardHeader title={t("dash.timeline")} description={t("dash.timelineDesc", { currency: s.baseCurrency })} />
            <SpendChart data={timeline} currency={s.baseCurrency} />
          </Card>

          <Card className="xl:col-span-2 flex flex-col">
            <CardHeader
              title={t("dash.upcoming")}
              description={t("dash.next30")}
              action={
                <Button size="sm" variant="ghost" onClick={() => navigate("calendar")}>
                  {t("dash.calendar")}
                </Button>
              }
            />
            {upcoming.length === 0 ? (
              <EmptyState icon={CalendarClock} title={t("dash.noUpcoming")} description={t("dash.noUpcomingDesc")} />
            ) : (
              <div className="px-2 pb-2 max-h-80 overflow-y-auto">
                {upcoming.slice(0, 12).map(({ sub, date }) => (
                  <UpcomingRow key={sub.id + date} sub={sub} date={date} onClick={() => navigate("subscriptions", sub.id)} />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card>
            <CardHeader title={t("dash.byCategory")} description={s.baseCurrency} />
            {byCategory.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title={t("dash.noData")}
                action={
                  <Button size="sm" icon={Plus} onClick={() => navigate("subscriptions")}>
                    {t("dash.addSub")}
                  </Button>
                }
              />
            ) : (
              <div className="px-4 pb-4 flex flex-col gap-2.5">
                {byCategory.map(([cat, total]) => (
                  <div key={cat} className="grid grid-cols-[8rem_1fr_6.5rem] items-center gap-3" title={`${cat}: ${t("dash.perMonth", { value: formatMoney(total, s.baseCurrency) })}`}>
                    <span className="text-[13px] font-medium text-fg-2 truncate">{cat}</span>
                    <div className="h-2.5 rounded-full bg-subtle overflow-hidden">
                      <div className="h-full rounded-full bg-bar" style={{ width: `${Math.max(2, (total / byCategory[0][1]) * 100)}%` }} />
                    </div>
                    <span className="text-[13px] font-semibold text-fg text-right tabular-nums">
                      {formatMoney(total, s.baseCurrency)}
                      <span className="text-fg-4 font-medium ml-1">{formatPercent(total / monthly)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title={t("dash.byCard")}
              description={t("dash.byCardDesc")}
              action={
                <Button size="sm" variant="ghost" onClick={() => navigate("wallet")}>
                  {t("dash.myCards")}
                </Button>
              }
            />
            {perCard.length === 0 ? (
              <EmptyState icon={CreditCard} title={t("dash.noCardLinks")} description={t("dash.noCardLinksDesc")} />
            ) : (
              <div className="px-2 pb-2">
                {perCard.map(({ card, total, count }) => (
                  <button key={card.id} type="button" onClick={() => navigate("wallet", card.id)} className="flex items-center gap-3 w-full px-2 py-2 rounded-lg hover:bg-hover cursor-pointer text-left">
                    <MiniCard color={card.color} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-fg truncate">{card.name}</div>
                      <div className="text-xs font-medium text-fg-3">
                        {maskCardNumber(card.number)} · {t("dash.cardSubs", { count })}
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-fg tabular-nums">{t("dash.perMonthShort", { value: formatMoney(total, s.baseCurrency) })}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {data.items.length === 0 && subs.length === 0 && (
          <Card className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-subtle flex items-center justify-center text-fg-3">
              <Vault size={18} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-fg">{t("dash.ready")}</div>
              <div className="text-xs font-medium text-fg-3">{t("dash.readyDesc")}</div>
            </div>
            <Button icon={ShieldCheck} onClick={() => navigate("vault")}>
              {t("dash.goVault")}
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => navigate("subscriptions")}>
              {t("dash.addSub")}
            </Button>
          </Card>
        )}
      </div>
    </div>
  );
}

function UpcomingRow({ sub, date, onClick }: { sub: Subscription; date: string; onClick: () => void }) {
  const days = daysBetween(todayKey(), date);
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-3 w-full px-2 py-2 rounded-lg hover:bg-hover cursor-pointer text-left">
      <SiteIcon url={sub.url} name={sub.name} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-fg truncate">{sub.name}</div>
        <div className={cn("text-xs font-medium", days <= 3 ? "text-amber-600 dark:text-amber-400" : "text-fg-3")}>
          {formatShortDate(date)} · {relativeDays(days)}
        </div>
      </div>
      <span className="text-sm font-semibold text-fg tabular-nums">{formatMoney(sub.price, sub.currency)}</span>
    </button>
  );
}

/** Single-series column chart; projected months use a hatched fill so state isn't color-only. */
function SpendChart({ data, currency }: { data: { key: string; total: number; projected: boolean }[]; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.total), 1);
  const W = 600;
  const H = 180;
  const pad = { l: 8, r: 8, t: 12, b: 1 };
  const slot = (W - pad.l - pad.r) / data.length;
  const barW = Math.min(28, slot * 0.55);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const currentKey = todayKey().slice(0, 7);

  return (
    <div className="px-4 pb-4">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t("dash.chartLabel")}>
          <defs>
            <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--subtle)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--fg-4)" strokeWidth="2" />
            </pattern>
          </defs>
          {[0.25, 0.5, 0.75, 1].map((g) => (
            <line key={g} x1={pad.l} x2={W - pad.r} y1={y(max * g)} y2={y(max * g)} stroke="var(--line)" strokeDasharray="2 4" />
          ))}
          <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--line)" />
          {data.map((d, i) => {
            const cx = pad.l + slot * i + slot / 2;
            const top = y(d.total);
            const h = Math.max(0, H - pad.b - top);
            const r = Math.min(4, h);
            const x = cx - barW / 2;
            const base = H - pad.b;
            // Rounded top corners only, anchored flat to the baseline.
            const path = h > 0 ? `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z` : "";
            return (
              <g key={d.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                <rect x={cx - slot / 2} y={pad.t} width={slot} height={H - pad.t} fill={hover === i ? "var(--hover)" : "transparent"} />
                {path && <path d={path} fill={d.projected ? "url(#hatch)" : "var(--bar)"} opacity={hover === null || hover === i ? 1 : 0.55} />}
              </g>
            );
          })}
        </svg>
        {hover !== null && (
          <div
            className="absolute pointer-events-none -translate-x-1/2 -translate-y-full px-2.5 py-1.5 rounded-md bg-primary text-primary-fg text-xs font-semibold shadow-lg whitespace-nowrap"
            style={{ left: `${((8 + ((W - 16) / data.length) * hover + (W - 16) / data.length / 2) / W) * 100}%`, top: `${(y(data[hover].total) / H) * 100}%` }}
          >
            {formatMonth(data[hover].key, "long")}
            <div className="text-[13px]">{formatMoney(data[hover].total, currency)}</div>
            <div className="font-medium opacity-70">{t(data[hover].projected ? "dash.projected" : data[hover].key === currentKey ? "dash.paidPlusDue" : "dash.actual")}</div>
          </div>
        )}
      </div>
      {/* Month labels live outside the SVG so they keep a fixed size as the chart scales. */}
      <div className="grid mt-1.5" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))`, paddingInline: `${(pad.l / W) * 100}%` }}>
        {data.map((d, i) => (
          <span
            key={d.key}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className={cn("text-center text-[11px] truncate", d.key === currentKey ? "font-bold text-fg" : "font-medium text-fg-3")}
          >
            {formatMonth(d.key)}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-2 text-xs font-medium text-fg-3">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-bar" /> {t("dash.actual")}
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="10" height="10">
            <rect width="10" height="10" rx="2" fill="url(#hatch)" />
          </svg>
          {t("dash.projected")}
        </span>
      </div>
    </div>
  );
}
