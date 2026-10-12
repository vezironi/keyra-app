import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast as sonner } from "sonner";
import { isPermissionGranted, sendNotification } from "@tauri-apps/plugin-notification";
import { listen } from "@tauri-apps/api/event";
import type { AppFont, CardItem, Settings, VaultData } from "./lib/types";
import { api, errorMessage, isTauri } from "./lib/api";
import { backupDue, writeAutoBackup } from "./lib/backup";
import { expiredTrash, purge } from "./lib/trash";
import { fetchRates, ratesDue } from "./lib/rates";
import { migrate } from "./lib/defaults";
import { VaultProvider, useVault, type Toast } from "./lib/store";
import { DEMO_PASSWORD, isDemo } from "./lib/demo";
import { daysUntilNext, isBilling, reconcile } from "./lib/subscriptions";
import { cn, formatMoney, relativeDays, setDateFormat } from "./lib/format";
import { resolveLanguage, setLanguage, t, type LanguagePreference } from "@/i18n";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "./components/Sidebar";
import { CommandPalette } from "./components/CommandPalette";
import { BrowserBridge } from "./components/BrowserBridge";
import { DemoBanner } from "./components/DemoBanner";
import { TestBanner } from "./components/TestBanner";
import { cardMonthsLeft } from "./components/visuals";
import { LockScreen } from "./pages/LockScreen";
import { Dashboard } from "./pages/Dashboard";
import { VaultPage } from "./pages/vault/VaultPage";
import { SubscriptionsPage } from "./pages/subscriptions/SubscriptionsPage";
import { CalendarPage } from "./pages/CalendarPage";
import { WalletPage } from "./pages/WalletPage";
import { GeneratorPage, clearGeneratorHistory } from "./pages/GeneratorPage";
import { SecurityPage } from "./pages/SecurityPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ReportsPage } from "./pages/ReportsPage";

type Phase = { kind: "loading" } | { kind: "setup" } | { kind: "locked" } | { kind: "unlocked"; data: VaultData; session: number };

/**
 * Appearance preferences live in the encrypted vault, but the lock screen is shown
 * before the vault is open, so a copy is mirrored to localStorage.
 */
interface Prefs {
  theme: Settings["theme"];
  language: LanguagePreference;
  font: AppFont;
  closeToTray: boolean;
  globalShortcut: string;
  browserIntegration: boolean;
  /** The vault is the test account, so the lock screen can offer its password. */
  testAccount: boolean;
}

const PREFS_KEY = "keyra-prefs";
const DEFAULT_PREFS: Prefs = { theme: "system", language: "system", font: "manrope", closeToTray: true, globalShortcut: "CommandOrControl+Shift+Space", browserIntegration: false, testAccount: false };

function loadPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_PREFS;
  }
}

function useAppearance(prefs: Prefs) {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", prefs.theme === "dark" || (prefs.theme === "system" && media.matches));
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [prefs.theme]);

  useEffect(() => {
    document.documentElement.dataset.font = prefs.font;
  }, [prefs.font]);
}

export default function App() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [searchOpen, setSearchOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  useAppearance(prefs);

  // Set synchronously during render so every component below translates with it.
  const lang = resolveLanguage(prefs.language);
  setLanguage(lang);

  const onPrefsChange = useCallback((next: Prefs) => {
    setPrefs((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const toast = useCallback((message: string, kind: Toast["kind"] = "info") => {
    if (kind === "success") sonner.success(message);
    else if (kind === "error") sonner.error(message);
    else sonner(message);
  }, []);

  // Tray and global shortcut need to work before unlock too, so they follow the local mirror.
  useEffect(() => {
    api
      .shellConfigure({
        closeToTray: prefs.closeToTray,
        shortcut: prefs.globalShortcut,
        labels: { open: t("tray.open"), search: t("tray.search"), lock: t("tray.lock"), quit: t("tray.quit") },
      })
      .catch((e) => toast(t("tray.shortcutFailed", { error: errorMessage(e) }), "error"));
  }, [prefs.closeToTray, prefs.globalShortcut, lang, toast]);

  // The extension should see "locked" rather than "not running" before unlock, so this follows the mirror too.
  useEffect(() => {
    api.browserConfigure(prefs.browserIntegration).catch((e) => toast(errorMessage(e), "error"));
  }, [prefs.browserIntegration, toast]);

  useEffect(() => {
    api
      .status()
      .then(async (s) => {
        // The demo opens straight into its sample vault.
        if (isDemo && s.exists) {
          try {
            return onUnlocked(await api.unlock(DEMO_PASSWORD));
          } catch {
            /* password changed in this tab; show the lock screen */
          }
        }
        setPhase({ kind: s.exists ? "locked" : "setup" });
      })
      .catch(() => setPhase({ kind: "setup" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDeleted = useCallback(() => {
    clearGeneratorHistory();
    setSearchOpen(false);
    try {
      localStorage.removeItem(PREFS_KEY);
    } catch {
      /* storage unavailable */
    }
    setPrefs(DEFAULT_PREFS);
    setPhase({ kind: "setup" });
  }, []);

  const onUnlocked = (json: string) => {
    const data = migrate(JSON.parse(json));
    setPhase({ kind: "unlocked", data, session: Date.now() });
  };

  const onLock = useCallback(() => {
    clearGeneratorHistory();
    setSearchOpen(false);
    setPhase({ kind: "locked" });
  }, []);

  return (
    <TooltipProvider delayDuration={400}>
      {phase.kind === "loading" && (
        <div className="h-full flex items-center justify-center text-fg-3">
          <Loader2 className="animate-spin" />
        </div>
      )}
      {(phase.kind === "setup" || phase.kind === "locked") && <LockScreen key={lang} mode={phase.kind === "setup" ? "setup" : "unlock"} onUnlocked={onUnlocked} testAccount={prefs.testAccount} />}
      {phase.kind === "unlocked" && (
        <VaultProvider key={phase.session} initial={phase.data} onLock={onLock} onDeleted={onDeleted} toast={toast} openSearch={() => setSearchOpen(true)}>
          {/* Keyed by language so a language switch re-renders every page. */}
          <Shell key={lang} searchOpen={searchOpen} setSearchOpen={setSearchOpen} onPrefsChange={onPrefsChange} />
        </VaultProvider>
      )}

      <Toaster theme={prefs.theme} position="bottom-right" />
    </TooltipProvider>
  );
}

function Shell({ searchOpen, setSearchOpen, onPrefsChange }: { searchOpen: boolean; setSearchOpen: (v: boolean) => void; onPrefsChange: (p: Prefs) => void }) {
  const { data, update, nav, lock, toast } = useVault();
  const { autoBackupDays, autoBackupDir, autoBackupKeep } = data.settings;
  const lastAutoBackup = useRef(data.lastAutoBackup);
  lastAutoBackup.current = data.lastAutoBackup;
  const { autoLockMinutes, theme, language, font, closeToTray, globalShortcut, browserIntegration, notifications, notifyTrials, notifyCardExpiry, autoRates } = data.settings;
  const testAccount = !!data.test;
  setDateFormat(data.settings.dateFormat);

  useEffect(
    () => onPrefsChange({ theme, language, font, closeToTray, globalShortcut, browserIntegration, testAccount }),
    [theme, language, font, closeToTray, globalShortcut, browserIntegration, testAccount, onPrefsChange],
  );

  // Global shortcut and tray menu.
  useEffect(() => {
    if (!isTauri) return;
    const off = [listen("shell://quick-search", () => setSearchOpen(true)), listen("shell://lock", () => lock())];
    return () => off.forEach((p) => p.then((f) => f()).catch(() => {}));
  }, [lock, setSearchOpen]);

  // Items stay in the trash for 30 days.
  useEffect(() => {
    update((d) => {
      const ids = expiredTrash(d);
      return ids.size ? purge(d, ids) : d;
    });
  }, [update]);

  // Exchange rates, if the user opted in.
  const ratesUpdatedAt = useRef(data.ratesUpdatedAt);
  ratesUpdatedAt.current = data.ratesUpdatedAt;
  useEffect(() => {
    if (!autoRates) return;
    const run = () => {
      if (!ratesDue(ratesUpdatedAt.current)) return;
      fetchRates(data.settings.rates)
        .then(({ rates }) => update((d) => ({ ...d, ratesUpdatedAt: new Date().toISOString(), settings: { ...d.settings, rates: { ...d.settings.rates, ...rates } } })))
        .catch(() => {});
    };
    run();
    const id = window.setInterval(run, 60 * 60 * 1000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRates, update]);

  // Log passed billing dates as payments; re-check hourly so a long-running session stays current.
  useEffect(() => {
    const run = () => {
      update((d) => {
        const subs = reconcile(d.subscriptions);
        return subs ? { ...d, subscriptions: subs } : d;
      });
    };
    run();
    const id = window.setInterval(run, 60 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [update]);

  // Automatic backups: checked shortly after unlock (once pending saves are on disk) and hourly.
  useEffect(() => {
    if (!isTauri || !autoBackupDays || !autoBackupDir) return;
    let failed = false;
    const run = async () => {
      if (failed || !backupDue(autoBackupDays, autoBackupDir, lastAutoBackup.current)) return;
      try {
        const at = await writeAutoBackup(autoBackupDir, autoBackupKeep);
        update((d) => ({ ...d, lastAutoBackup: at }));
      } catch (e) {
        // Report once per session instead of every hour.
        failed = true;
        toast(t("settings.backup.autoFailed", { error: errorMessage(e) }), "error");
      }
    };
    const first = window.setTimeout(run, 5000);
    const id = window.setInterval(run, 60 * 60 * 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [autoBackupDays, autoBackupDir, autoBackupKeep, update, toast]);

  // Desktop reminders, each sent once per billing date (or once per card expiry).
  useEffect(() => {
    if (!isTauri || !(notifications || notifyTrials || notifyCardExpiry)) return;
    const check = async () => {
      if (!(await isPermissionGranted())) return;
      const sent: string[] = [];
      const fresh = (key: string) => !data.notified.includes(key);

      for (const x of data.subscriptions) {
        const wanted = x.status === "trial" ? notifyTrials : notifications;
        const days = daysUntilNext(x);
        const key = `${x.id}:${x.nextBillingDate}`;
        if (!wanted || !isBilling(x) || x.reminderDays < 0 || days < 0 || days > x.reminderDays || !fresh(key)) continue;
        sendNotification({
          title: t(x.status === "trial" ? "notify.trialTitle" : "notify.dueTitle", { name: x.name }),
          body: `${relativeDays(days)} · ${formatMoney(x.price, x.currency)}`,
        });
        sent.push(key);
      }

      if (notifyCardExpiry) {
        for (const c of data.items.filter((i): i is CardItem => i.type === "card")) {
          const left = cardMonthsLeft(c);
          const key = `card:${c.id}:${c.expYear}-${c.expMonth}`;
          if (left === null || left < 0 || left > 1 || !fresh(key)) continue;
          sendNotification({ title: t("notify.cardTitle", { name: c.name }), body: t("notify.cardBody") });
          sent.push(key);
        }
      }

      if (sent.length) update((d) => ({ ...d, notified: [...d.notified, ...sent].slice(-500) }));
    };
    check();
    const id = window.setInterval(check, 30 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [notifications, notifyTrials, notifyCardExpiry, data.subscriptions, data.items, data.notified, update]);

  // Auto-lock on inactivity.
  useEffect(() => {
    if (!autoLockMinutes) return;
    let timer = window.setTimeout(lock, autoLockMinutes * 60_000);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lock, autoLockMinutes * 60_000);
    };
    const events = ["mousemove", "keydown", "mousedown", "wheel"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [autoLockMinutes, lock]);

  // Global shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "k") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (k === "l") {
        e.preventDefault();
        lock();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lock, setSearchOpen]);

  const pages = {
    dashboard: Dashboard,
    vault: VaultPage,
    subscriptions: SubscriptionsPage,
    calendar: CalendarPage,
    reports: ReportsPage,
    wallet: WalletPage,
    generator: GeneratorPage,
    security: SecurityPage,
    settings: SettingsPage,
  };
  const PageComponent = pages[nav.page];

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden">
      {isDemo && <DemoBanner />}
      {testAccount && !isDemo && <TestBanner />}
      <div className="flex flex-1 min-h-0 w-full flex-row overflow-hidden">
        <Sidebar />
        <main className={cn("flex flex-col flex-1 min-w-0 my-2 mr-2 rounded-xl border border-line-strong bg-surface overflow-hidden")}>
          <PageComponent key={nav.page} />
        </main>
      </div>
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      {isTauri && browserIntegration && <BrowserBridge />}
    </div>
  );
}
