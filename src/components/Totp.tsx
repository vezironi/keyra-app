import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { generateTotp, parseTotp } from "../lib/totp";
import { useVault } from "../lib/store";
import { IconButton } from "./kit";
import { t } from "@/i18n";

export function TotpRow({ secret }: { secret: string }) {
  const { copy } = useVault();
  const cfg = useMemo(() => parseTotp(secret), [secret]);
  const [code, setCode] = useState("");
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!cfg) return;
    let alive = true;
    const tick = async () => {
      const now = Date.now();
      const c = await generateTotp(cfg, now);
      if (!alive) return;
      setCode(c);
      setRemaining(cfg.period - (Math.floor(now / 1000) % cfg.period));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [cfg]);

  if (!cfg) {
    return (
      <div className="px-4 py-2.5 border-b border-line">
        <div className="text-xs font-medium text-fg-3">{t("totp.label")}</div>
        <div className="text-sm text-red-600 mt-0.5">{t("totp.invalid")}</div>
      </div>
    );
  }

  const half = Math.ceil(code.length / 2);
  const pct = cfg ? remaining / cfg.period : 0;
  return (
    <div className="group flex items-center gap-3 px-4 py-2.5 border-b border-line last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-fg-3">{t("totp.label")}</div>
        <div className="text-lg font-mono font-semibold tracking-widest text-fg mt-0.5 selectable">
          {code.slice(0, half)} {code.slice(half)}
        </div>
      </div>
      <div className="relative w-8 h-8" title={`${remaining} sn`}>
        <svg viewBox="0 0 36 36" className="w-8 h-8 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="var(--line)" strokeWidth="3" />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke={remaining <= 5 ? "var(--color-red-500)" : "var(--fg)"}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${pct * 94.25} 94.25`}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-fg-2">{remaining}</span>
      </div>
      <IconButton icon={Copy} label={t("common.copy")} onClick={() => copy(code, t("totp.copyLabel"))} />
    </div>
  );
}
