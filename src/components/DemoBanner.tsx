import { Download, RotateCcw } from "lucide-react";
import { DEMO_DOWNLOAD_URL, DEMO_LIMITS, resetDemo } from "@/lib/demo";
import { useVault } from "@/lib/store";
import { t } from "@/i18n";

/** Strip above the app in the web demo: what the demo is, how full it is, and the way out. */
export function DemoBanner() {
  const { data } = useVault();
  return (
    <div className="shrink-0 flex items-center gap-3 h-10 px-4 bg-primary text-primary-fg text-xs font-medium">
      <span className="px-1.5 py-0.5 rounded bg-primary-fg/15 text-[10px] font-bold uppercase tracking-wider">{t("demo.badge")}</span>
      <span className="truncate opacity-90">{t("demo.banner")}</span>
      <span className="hidden lg:inline shrink-0 opacity-60 tabular-nums">
        {data.items.length}/{DEMO_LIMITS.items} · {data.subscriptions.length}/{DEMO_LIMITS.subscriptions}
      </span>
      <div className="ml-auto flex items-center gap-1.5 shrink-0">
        <button type="button" onClick={resetDemo} className="flex items-center gap-1.5 h-7 px-2.5 rounded-md hover:bg-primary-fg/10 cursor-pointer">
          <RotateCcw size={13} />
          {t("demo.reset")}
        </button>
        <a href={DEMO_DOWNLOAD_URL} target="_top" className="flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-primary-fg text-primary font-semibold hover:opacity-90">
          <Download size={13} />
          {t("demo.download")}
        </a>
      </div>
    </div>
  );
}
