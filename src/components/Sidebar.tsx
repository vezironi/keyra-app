import {
  CalendarDays,
  ChartColumn,
  ChevronsLeft,
  ChevronsRight,
  KeyRound,
  LayoutDashboard,
  Lock,
  Repeat,
  Search,
  Settings,
  ShieldCheck,
  Vault,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Page } from "../lib/types";
import { cn } from "../lib/format";
import { useVault, type SaveState } from "../lib/store";
import { LogoMark } from "./Logo";
import { t, type TKey } from "@/i18n";

interface NavItem {
  page: Page;
  label: TKey;
  icon: LucideIcon;
}

const SECTIONS: { heading: TKey; items: NavItem[] }[] = [
  { heading: "nav.general", items: [{ page: "dashboard", label: "nav.dashboard", icon: LayoutDashboard }] },
  {
    heading: "nav.vault",
    items: [
      { page: "vault", label: "nav.allItems", icon: Vault },
      { page: "generator", label: "nav.generator", icon: KeyRound },
      { page: "security", label: "nav.security", icon: ShieldCheck },
    ],
  },
  {
    heading: "nav.subscriptions",
    items: [
      { page: "subscriptions", label: "nav.subscriptions", icon: Repeat },
      { page: "calendar", label: "nav.calendar", icon: CalendarDays },
      { page: "reports", label: "nav.reports", icon: ChartColumn },
      { page: "wallet", label: "nav.wallet", icon: Wallet },
    ],
  },
];

const SAVE_LABEL: Record<SaveState, TKey> = { saved: "nav.saved", saving: "nav.saving", error: "nav.saveError" };
const SAVE_DOT: Record<SaveState, string> = { saved: "bg-emerald-500", saving: "bg-amber-500 animate-pulse", error: "bg-red-500" };

export function Sidebar() {
  const { nav, navigate, data, update, lock, saveState, openSearch } = useVault();
  const collapsed = data.settings.sidebarCollapsed;
  const toggle = () => update((d) => ({ ...d, settings: { ...d.settings, sidebarCollapsed: !collapsed } }));

  const link = (item: NavItem) => {
    const active = nav.page === item.page;
    return (
      <li key={item.page} className="w-full">
        <button
          type="button"
          // The marketing site's live preview drives these buttons by page name.
          data-page={item.page}
          onClick={() => navigate(item.page)}
          title={collapsed ? t(item.label) : undefined}
          className={cn(
            "flex items-center gap-x-2 w-full py-1.5 px-2 text-sm font-medium cursor-pointer rounded-md transition-colors",
            active ? "bg-hover text-fg" : "text-fg-2 hover:bg-hover hover:text-fg",
          )}
        >
          <item.icon size={16} className="shrink-0" />
          {!collapsed && <span className="truncate">{t(item.label)}</span>}
        </button>
      </li>
    );
  };

  return (
    <aside className={cn("shrink-0 h-full p-2 transition-[width] duration-200", collapsed ? "w-16" : "w-60")}>
      <nav aria-label={t("nav.mainMenu")} className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-2 p-2">
          <div className="w-8 h-8 shrink-0 bg-primary flex items-center justify-center rounded-md text-primary-fg">
            <LogoMark size={18} />
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold text-fg truncate">Keyra</span>
              <span className="text-xs font-medium text-fg-3 truncate">{t("nav.tagline")}</span>
            </div>
          )}
        </div>

        <div className="px-2 mt-2">
          <button
            type="button"
            onClick={openSearch}
            title={t("nav.searchHint")}
            className={cn(
              "group flex items-center gap-2 w-full h-8 rounded-md border border-line-strong text-fg-3 hover:bg-hover hover:text-fg cursor-pointer transition-colors",
              collapsed ? "justify-center" : "px-2",
            )}
          >
            <Search size={15} className="shrink-0" />
            {!collapsed && (
              <>
                <span className="text-[13px] font-medium">{t("nav.search")}</span>
                <kbd className="ml-auto flex items-center px-1.5 h-5 rounded bg-subtle border border-line text-[10px] font-semibold text-fg-3">Ctrl K</kbd>
              </>
            )}
          </button>
        </div>

        <div className="flex flex-col items-start mt-3 p-2 flex-1 min-h-0 overflow-y-auto overflow-x-hidden gap-y-3.5">
          {SECTIONS.map((section, i) => (
            <div key={section.heading} className="flex flex-col items-start gap-1.5 w-full">
              <div className="relative w-full h-4 flex items-center">
                {collapsed ? i > 0 && <span className="absolute inset-x-1 h-px bg-line" /> : <span className="text-xs font-medium text-fg-3">{t(section.heading)}</span>}
              </div>
              <ul className="flex flex-col items-start gap-0.5 w-full">{section.items.map(link)}</ul>
            </div>
          ))}
        </div>

        <div className="shrink-0 w-full p-2 flex flex-col gap-0.5">
          {link({ page: "settings", label: "nav.settings", icon: Settings })}
          <button
            type="button"
            onClick={lock}
            title={collapsed ? t("nav.lockHint") : undefined}
            className="flex items-center gap-x-2 w-full py-1.5 px-2 text-sm font-medium cursor-pointer rounded-md text-fg-2 hover:bg-hover hover:text-fg"
          >
            <Lock size={16} className="shrink-0" />
            {!collapsed && (
              <>
                <span>{t("nav.lock")}</span>
                <kbd className="ml-auto text-[10px] font-semibold text-fg-4">Ctrl L</kbd>
              </>
            )}
          </button>
          <div className={cn("flex items-center mt-2 pt-2 border-t border-line", collapsed ? "flex-col gap-2" : "justify-between pl-2")}>
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-fg-3" title={t(SAVE_LABEL[saveState])}>
              <span className={cn("w-1.5 h-1.5 rounded-full", SAVE_DOT[saveState])} />
              {!collapsed && t(SAVE_LABEL[saveState])}
            </span>
            <button
              type="button"
              onClick={toggle}
              aria-label={t(collapsed ? "nav.expand" : "nav.collapse")}
              className="w-7.5 h-7.5 flex items-center justify-center rounded-md text-fg-3 hover:text-fg hover:bg-hover cursor-pointer"
            >
              {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
            </button>
          </div>
        </div>
      </nav>
    </aside>
  );
}
