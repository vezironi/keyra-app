import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, CreditCard, Copy, KeyRound, Link2Off, Loader2, Radar, ShieldAlert, ShieldOff, type LucideIcon } from "lucide-react";
import type { LoginItem, VaultItem } from "../lib/types";
import { useVault } from "../lib/store";
import { analyze, type SecurityReport } from "../lib/security";
import { checkBreaches, freshBreach } from "../lib/breach";
import { errorMessage } from "../lib/api";
import { cn, relativeTime } from "../lib/format";
import { passwordStrength, strengthLabel } from "../lib/password";
import { Badge, Button, Card, PageHeader } from "@/components/kit";
import { ItemIcon } from "../components/visuals";
import { t, type TKey } from "@/i18n";

export function SecurityPage() {
  const { data } = useVault();
  const r = useMemo(() => analyze(data), [data]);
  const scoreTone = r.score >= 80 ? "text-emerald-600" : r.score >= 50 ? "text-amber-600" : "text-red-600";

  return (
    <div className="h-full overflow-y-auto">
      <PageHeader title={t("sec.title")} description={t("sec.description")} />
      <div className="px-6 pb-8 flex flex-col gap-4 max-w-5xl">
        <Card className="p-5 flex items-center gap-6">
          <div className="relative w-24 h-24 shrink-0">
            <svg viewBox="0 0 36 36" className="w-24 h-24 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--subtle)" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(r.score / 100) * 97.4} 97.4`} className={scoreTone} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-fg tabular-nums">{r.score}</span>
              <span className="text-[10px] font-semibold text-fg-3">/ 100</span>
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-fg">{t(r.score >= 80 ? "sec.good" : r.score >= 50 ? "sec.fair" : "sec.bad")}</h2>
            <p className="text-sm text-fg-3 mt-1">
              {t("sec.explain", { count: r.logins.length })}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {r.breached.length > 0 && <Badge className="bg-red-500/10 text-red-700 dark:text-red-400">{t("sec.badgeBreached", { count: r.breached.length })}</Badge>}
              <Badge className="bg-red-500/10 text-red-700 dark:text-red-400">{t("sec.badgeWeak", { count: r.weak.length })}</Badge>
              <Badge className="bg-red-500/10 text-red-700 dark:text-red-400">{t("sec.badgeReused", { count: r.reusedIds.size })}</Badge>
              <Badge className="bg-amber-500/10 text-amber-800 dark:text-amber-300">{t("sec.badgeOld", { count: r.old.length })}</Badge>
              <Badge>{t("sec.badgeNo2fa", { count: r.no2fa.length })}</Badge>
            </div>
          </div>
        </Card>

        <BreachCard report={r} />
        <IssueGroup icon={ShieldAlert} title={t("sec.weak")} description={t("sec.weakDesc")} items={r.weak} tone="danger" detail={(i) => i.type === "login" && strengthLabel(passwordStrength(i.password))} />
        <Card>
          <GroupHeader icon={Copy} title={t("sec.reused")} description={t("sec.reusedDesc")} count={r.reused.length} tone="danger" unit="sec.groups">
            {r.reused.map((g, gi) => (
              <div key={gi} className="border-t border-line">
                <div className="px-4 py-2 text-xs font-semibold text-fg-3 bg-subtle/40">{t("sec.sameOn", { count: g.items.length })}</div>
                {g.items.map((i) => (
                  <ItemRow key={i.id} item={i} />
                ))}
              </div>
            ))}
          </GroupHeader>
        </Card>
        <IssueGroup icon={Clock} title={t("sec.old")} description={t("sec.oldDesc")} items={r.old} tone="warn" detail={(i) => i.type === "login" && t("sec.changed", { when: relativeTime(i.passwordUpdatedAt) })} />
        <IssueGroup icon={ShieldOff} title={t("sec.no2fa")} description={t("sec.no2faDesc")} items={r.no2fa} tone="info" />
        <IssueGroup icon={Link2Off} title={t("sec.insecure")} description={t("sec.insecureDesc")} items={r.insecureUrl} tone="warn" />
        <IssueGroup icon={KeyRound} title={t("sec.empty")} items={r.empty} tone="info" />
        <IssueGroup icon={CreditCard} title={t("sec.expiring")} description={t("sec.expiringDesc")} items={r.expiringCards} tone="warn" />
      </div>
    </div>
  );
}

function BreachCard({ report }: { report: SecurityReport }) {
  const { data, update, toast } = useVault();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const logins = report.logins.filter((l) => l.password);
  const lastCheck = Object.values(data.breaches).reduce((max, b) => (b.at > max ? b.at : max), "");

  const run = async () => {
    setProgress({ done: 0, total: 0 });
    try {
      const results = await checkBreaches(logins, (done, total) => setProgress({ done, total }));
      update((d) => ({ ...d, breaches: results }));
      const found = Object.values(results).filter((b) => b.count > 0).length;
      toast(found ? t("sec.breachFound", { count: found }) : t("sec.breachNone"), found ? "error" : "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setProgress(null);
    }
  };

  const count = report.breached.length;
  return (
    <Card>
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", count ? TONE.danger : lastCheck ? "bg-emerald-500/10 text-emerald-600" : TONE.info)}>
          {count || !lastCheck ? <Radar size={17} /> : <CheckCircle2 size={17} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-fg">{t("sec.breach")}</div>
          <div className="text-xs text-fg-3 mt-0.5">{t("sec.breachDesc")}</div>
          <div className="text-xs font-medium text-fg-2 mt-1">
            {lastCheck ? t("sec.breachLast", { when: relativeTime(lastCheck) }) : t("sec.breachNever")}
            {lastCheck && report.breachUnchecked > 0 && <> · {t("sec.breachUnchecked", { count: report.breachUnchecked })}</>}
          </div>
        </div>
        <Button icon={progress ? undefined : Radar} onClick={run} disabled={!!progress || !logins.length}>
          {progress && <Loader2 size={15} className="animate-spin" />}
          {progress ? t("sec.breachChecking", { done: progress.done, total: progress.total || "…" }) : t("sec.breachCheck")}
        </Button>
      </div>
      {count > 0 && (
        <div className="border-t border-line">
          {report.breached.map((i: LoginItem) => (
            <ItemRow key={i.id} item={i} detail={t("sec.breachSeen", { count: freshBreach(i, data.breaches)?.count ?? 0 })} />
          ))}
        </div>
      )}
    </Card>
  );
}

const TONE: Record<string, string> = {
  danger: "bg-red-500/10 text-red-600 dark:text-red-400",
  warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  info: "bg-subtle text-fg-3",
};

function GroupHeader({ icon: Icon, title, description, count, tone, unit = "sec.items", children }: { icon: LucideIcon; title: string; description?: string; count: number; tone: string; unit?: TKey; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => count && setOpen((o) => !o)} className={cn("flex items-center gap-3 w-full px-4 py-3.5 text-left", count ? "cursor-pointer hover:bg-hover/50" : "cursor-default")}>
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", count ? TONE[tone] : "bg-emerald-500/10 text-emerald-600")}>{count ? <Icon size={17} /> : <CheckCircle2 size={17} />}</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-fg">{title}</div>
          {description && <div className="text-xs text-fg-3 mt-0.5">{description}</div>}
        </div>
        <span className="text-sm font-semibold text-fg tabular-nums">{count ? t(unit, { count }) : t("sec.noIssues")}</span>
        {count > 0 && <ChevronDown size={16} className={cn("text-fg-3 transition-transform", open && "rotate-180")} />}
      </button>
      {open && children}
    </>
  );
}

function IssueGroup({ items, detail, ...rest }: { icon: LucideIcon; title: string; description?: string; items: VaultItem[]; tone: string; detail?: (i: VaultItem) => ReactNode }) {
  return (
    <Card>
      <GroupHeader {...rest} count={items.length}>
        <div className="border-t border-line">
          {items.map((i) => (
            <ItemRow key={i.id} item={i} detail={detail?.(i)} />
          ))}
        </div>
      </GroupHeader>
    </Card>
  );
}

function ItemRow({ item, detail }: { item: VaultItem; detail?: ReactNode }) {
  const { navigate } = useVault();
  return (
    <button type="button" onClick={() => navigate(item.type === "card" ? "wallet" : "vault", item.id)} className="flex items-center gap-3 w-full px-4 py-2 border-b border-line last:border-b-0 hover:bg-hover cursor-pointer text-left">
      <ItemIcon item={item} size={28} />
      <span className="text-sm font-medium text-fg flex-1 truncate">{item.name}</span>
      {detail && <span className="text-xs font-medium text-fg-3">{detail}</span>}
      <AlertTriangle size={14} className="text-fg-4" />
    </button>
  );
}
