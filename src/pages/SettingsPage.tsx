import { useEffect, useState, type ReactNode } from "react";
import { save as saveDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { Bell, Check, CircleDot, DatabaseBackup, Download, FileInput, Fingerprint, FolderOpen, Keyboard, KeyRound, Loader2, Monitor, RefreshCw, Save, Palette, Plus, Puzzle, Repeat, ShieldCheck, SlidersHorizontal, Trash2, Upload, UserX, X, type LucideIcon } from "lucide-react";
import type { AppFont, Settings } from "@/lib/types";
import { useVault } from "@/lib/store";
import { api, errorMessage, isTauri, BROWSER_PORT, type BrowserClient } from "@/lib/api";
import { migrate } from "@/lib/defaults";
import { mergeImport, parseExport, type ImportSource, type ParsedImport } from "@/lib/importers";
import { writeAutoBackup } from "@/lib/backup";
import { findUpdate, promptUpdate } from "@/lib/updater";
import { getVersion } from "@tauri-apps/api/app";
import { fetchRates } from "@/lib/rates";
import { reconcile } from "@/lib/subscriptions";
import { cn, formatDate, relativeTime, todayKey, type DateFormat } from "@/lib/format";
import { LANGUAGES, detectLanguage, t, type TKey } from "@/i18n";
import { Switch } from "@/components/ui/switch";
import { Button, ConfirmModal, Field, IconButton, Input, Modal, SecretInput, Segmented, Select } from "@/components/kit";

type SectionId = "general" | "appearance" | "notifications" | "security" | "desktop" | "browser" | "subscriptions" | "backup";

const SECTIONS: { id: SectionId; icon: LucideIcon }[] = [
  { id: "general", icon: SlidersHorizontal },
  { id: "appearance", icon: Palette },
  { id: "notifications", icon: Bell },
  { id: "security", icon: ShieldCheck },
  { id: "desktop", icon: Monitor },
  { id: "browser", icon: Puzzle },
  { id: "subscriptions", icon: Repeat },
  { id: "backup", icon: DatabaseBackup },
];

const FONTS: { id: AppFont; name: string; family: string }[] = [
  { id: "manrope", name: "Manrope", family: '"Manrope Variable"' },
  { id: "montserrat", name: "Montserrat", family: '"Montserrat Variable"' },
  { id: "jakarta", name: "Plus Jakarta Sans", family: '"Plus Jakarta Sans Variable"' },
  { id: "dmsans", name: "DM Sans", family: '"DM Sans Variable"' },
  { id: "inter", name: "Inter", family: '"Inter Variable"' },
];

/** Settings that are edited as a draft and committed with "Save changes". */
interface Draft {
  settings: Settings;
  categories: string[];
}

/** A labelled setting: title, description, then the control underneath (as in the admin panel). */
function Row({ label, description, children }: { label: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="py-4 border-b border-line last:border-b-0">
      <div className="text-sm font-semibold text-fg">{label}</div>
      {description && <p className="text-xs font-medium text-fg-3 mt-0.5">{description}</p>}
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const { data, update } = useVault();
  const [section, setSection] = useState<SectionId>("general");
  const saved: Draft = { settings: data.settings, categories: data.categories };
  const [draft, setDraft] = useState<Draft>(saved);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const set = (p: Partial<Settings>) => setDraft((d) => ({ ...d, settings: { ...d.settings, ...p } }));
  const commit = () => update((d) => ({ ...d, settings: { ...draft.settings, sidebarCollapsed: d.settings.sidebarCollapsed }, categories: draft.categories }));

  const active = SECTIONS.find((x) => x.id === section)!;
  const ActiveIcon = active.icon;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 pt-8 flex flex-col min-h-full">
        <h1 className="text-2xl font-bold text-fg tracking-tight">{t("settings.title")}</h1>
        <p className="text-sm font-medium text-fg-3 mt-0.5">{t("settings.description")}</p>
        <div className="h-px bg-line mt-4" />

        <div className="flex gap-8 pt-4 flex-1">
          <nav className="w-48 shrink-0 flex flex-col gap-0.5">
            {SECTIONS.map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={cn(
                  "flex items-center gap-2.5 w-full h-8 px-2 rounded-md text-sm font-medium cursor-pointer transition-colors text-left",
                  section === id ? "bg-hover text-fg" : "text-fg-2 hover:bg-hover hover:text-fg",
                )}
              >
                <Icon size={16} className="shrink-0" />
                {t(`settings.${id}.title` as TKey)}
              </button>
            ))}
          </nav>

          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center gap-3 pb-4 border-b border-line">
              <div className="w-9 h-9 rounded-lg bg-subtle flex items-center justify-center text-fg-2 shrink-0">
                <ActiveIcon size={17} />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-fg">{t(`settings.${section}.title` as TKey)}</div>
                <div className="text-xs font-medium text-fg-3">{t(`settings.${section}.description` as TKey)}</div>
              </div>
            </div>

            <div className="flex-1">
              {section === "general" && <GeneralSection draft={draft} set={set} />}
              {section === "appearance" && <AppearanceSection draft={draft} set={set} />}
              {section === "notifications" && <NotificationsSection draft={draft} set={set} />}
              {section === "security" && <SecuritySection draft={draft} set={set} />}
              {section === "desktop" && <DesktopSection draft={draft} set={set} />}
              {section === "browser" && <BrowserSection draft={draft} set={set} />}
              {section === "subscriptions" && <SubscriptionsSection draft={draft} setDraft={setDraft} set={set} />}
              {section === "backup" && <BackupSection draft={draft} set={set} />}
            </div>

            <div className="sticky bottom-0 flex items-center gap-2 py-3 mt-6 border-t border-line bg-surface">
              <span className={cn("flex items-center gap-1.5 text-xs font-medium mr-auto", dirty ? "text-amber-600 dark:text-amber-400" : "text-fg-3")}>
                {dirty ? <CircleDot size={13} /> : <Check size={13} className="text-emerald-600" />}
                {t(dirty ? "settings.unsaved" : "settings.allSaved")}
              </span>
              <Button disabled={!dirty} onClick={() => setDraft(saved)}>
                {t("common.cancel")}
              </Button>
              <Button variant="primary" disabled={!dirty} onClick={commit}>
                {t("settings.saveChanges")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type SectionProps = { draft: Draft; set: (p: Partial<Settings>) => void };

function GeneralSection({ draft: { settings: s }, set }: SectionProps) {
  const sample = todayKey();
  const systemName = LANGUAGES.find((l) => l.value === detectLanguage())?.label ?? "";
  return (
    <>
      <Row label={t("settings.general.language")} description={t("settings.general.languageDesc")}>
        <Select
          value={s.language}
          onValueChange={(v) => set({ language: v as Settings["language"] })}
          options={[{ value: "system", label: t("settings.general.systemLanguage", { name: systemName }) }, ...LANGUAGES]}
        />
      </Row>
      <Row label={t("settings.general.dateFormat")} description={t("settings.general.dateFormatDesc")}>
        <Select
          value={s.dateFormat}
          onValueChange={(v) => set({ dateFormat: v as DateFormat })}
          options={(["long", "dmy", "mdy", "ymd"] as DateFormat[]).map((f) => ({ value: f, label: formatDate(sample, f) }))}
        />
      </Row>
      <Row label={t("settings.general.currency")} description={t("settings.general.currencyDesc")}>
        <Select value={s.baseCurrency} onValueChange={(baseCurrency) => set({ baseCurrency })} options={Object.keys(s.rates).map((c) => ({ value: c, label: c }))} />
      </Row>
    </>
  );
}

function AppearanceSection({ draft: { settings: s }, set }: SectionProps) {
  return (
    <>
      <Row label={t("settings.appearance.theme")} description={t("settings.appearance.themeDesc")}>
        <Segmented
          className="w-full"
          value={s.theme}
          onChange={(theme) => set({ theme })}
          options={[
            { value: "light", label: t("settings.appearance.light") },
            { value: "dark", label: t("settings.appearance.dark") },
            { value: "system", label: t("settings.appearance.system") },
          ]}
        />
      </Row>
      <Row label={t("settings.appearance.font")} description={t("settings.appearance.fontDesc")}>
        <div className="grid grid-cols-2 gap-2">
          {FONTS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => set({ font: f.id })}
              className={cn(
                "flex flex-col items-start gap-1 rounded-lg border p-3 text-left cursor-pointer transition-colors",
                s.font === f.id ? "border-fg ring-1 ring-fg" : "border-line-strong hover:bg-hover",
              )}
            >
              <span className="text-2xl font-bold text-fg leading-none" style={{ fontFamily: f.family }}>
                Aa
              </span>
              <span className="text-xs font-medium text-fg-2" style={{ fontFamily: f.family }}>
                {f.name}
              </span>
            </button>
          ))}
        </div>
      </Row>
      <Row label={t("settings.appearance.icons")} description={t("settings.appearance.iconsDesc")}>
        <Switch checked={s.showIcons} onCheckedChange={(showIcons) => set({ showIcons })} />
      </Row>
    </>
  );
}

function NotificationsSection({ draft: { settings: s }, set }: SectionProps) {
  const { toast } = useVault();
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    if (isTauri) isPermissionGranted().then(setGranted).catch(() => setGranted(false));
  }, []);

  const ask = async () => {
    const ok = (await requestPermission()) === "granted";
    setGranted(ok);
    if (!ok) toast(t("settings.notifications.denied"), "error");
  };

  return (
    <>
      <Row label={t("settings.notifications.payments")} description={t("settings.notifications.paymentsDesc")}>
        <Switch checked={s.notifications} onCheckedChange={(notifications) => set({ notifications })} />
      </Row>
      <Row label={t("settings.notifications.trials")} description={t("settings.notifications.trialsDesc")}>
        <Switch checked={s.notifyTrials} onCheckedChange={(notifyTrials) => set({ notifyTrials })} />
      </Row>
      <Row label={t("settings.notifications.cards")} description={t("settings.notifications.cardsDesc")}>
        <Switch checked={s.notifyCardExpiry} onCheckedChange={(notifyCardExpiry) => set({ notifyCardExpiry })} />
      </Row>
      <Row label={t("settings.notifications.desktop")} description={t("settings.notifications.desktopDesc")}>
        {!isTauri ? (
          <span className="text-xs font-medium text-fg-3">{t("errors.desktop_only")}</span>
        ) : granted ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
            <Check size={14} /> {t("settings.notifications.granted")}
          </span>
        ) : (
          <Button icon={Bell} onClick={ask}>
            {t("settings.notifications.allow")}
          </Button>
        )}
      </Row>
    </>
  );
}

function SecuritySection({ draft: { settings: s }, set }: SectionProps) {
  const [pwModal, setPwModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  return (
    <>
      <Row label={t("settings.security.autoLock")} description={t("settings.security.autoLockDesc")}>
        <Select
          value={s.autoLockMinutes}
          onValueChange={(v) => set({ autoLockMinutes: Number(v) })}
          options={[...[1, 5, 10, 15, 30, 60].map((m) => ({ value: String(m), label: t("settings.security.minutes", { count: m }) })), { value: "0", label: t("settings.security.never") }]}
        />
      </Row>
      <Row label={t("settings.security.clipboard")} description={t("settings.security.clipboardDesc")}>
        <Select
          value={s.clipboardClearSeconds}
          onValueChange={(v) => set({ clipboardClearSeconds: Number(v) })}
          options={[...[10, 20, 30, 60, 120].map((sec) => ({ value: String(sec), label: t("settings.security.seconds", { count: sec }) })), { value: "0", label: t("settings.security.dontClear") }]}
        />
      </Row>
      <Row label={t("settings.security.master")} description={t("settings.security.masterDesc")}>
        <Button icon={KeyRound} onClick={() => setPwModal(true)}>
          {t("settings.security.change")}
        </Button>
      </Row>
      <Row label={t("settings.security.deleteAccount")} description={t("settings.security.deleteAccountDesc")}>
        <Button variant="danger" icon={UserX} onClick={() => setDeleteModal(true)}>
          {t("settings.security.deleteButton")}
        </Button>
      </Row>
      <HelloRow />
      <ChangePasswordModal open={pwModal} onClose={() => setPwModal(false)} />
      {deleteModal && <DeleteAccountModal onClose={() => setDeleteModal(false)} />}
    </>
  );
}

function HelloRow() {
  const { toast } = useVault();
  const [status, setStatus] = useState<{ available: boolean; enabled: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.helloStatus().then(setStatus).catch(() => setStatus({ available: false, enabled: false }));
  }, []);

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) await api.helloEnable(t("settings.security.helloPrompt"));
      else await api.helloDisable();
      setStatus((s) => s && { ...s, enabled: on });
      toast(t(on ? "settings.security.helloEnabled" : "settings.security.helloDisabled"), "success");
    } catch (e) {
      if (e !== "hello_cancelled") toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Row label={t("settings.security.hello")} description={t("settings.security.helloDesc")}>
      {!status ? (
        <Loader2 size={16} className="animate-spin text-fg-3" />
      ) : status.available ? (
        <div className="flex items-center gap-2">
          <Fingerprint size={16} className="text-fg-3" />
          <Switch checked={status.enabled} disabled={busy} onCheckedChange={toggle} />
        </div>
      ) : (
        <span className="text-xs font-medium text-fg-3">{isTauri ? t("settings.security.helloUnavailable") : t("errors.desktop_only")}</span>
      )}
    </Row>
  );
}

const SHORTCUTS = ["CommandOrControl+Shift+Space", "CommandOrControl+Alt+Space", "CommandOrControl+Alt+K", "CommandOrControl+Shift+K"];
const shortcutLabel = (accel: string) => accel.replace("CommandOrControl", "Ctrl").split("+").join(" + ");

function AutostartRow() {
  const { toast } = useVault();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.autostartStatus().then(setEnabled).catch(() => setEnabled(false));
  }, []);

  const toggle = async (on: boolean) => {
    setBusy(true);
    try {
      await api.autostartSet(on);
      setEnabled(on);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Row label={t("settings.desktop.autostart")} description={t("settings.desktop.autostartDesc")}>
      {enabled === null ? <Loader2 size={16} className="animate-spin text-fg-3" /> : <Switch checked={enabled} disabled={busy} onCheckedChange={toggle} />}
    </Row>
  );
}

function UpdateRow() {
  const { toast } = useVault();
  const [version, setVersion] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  const checkNow = async () => {
    setBusy(true);
    try {
      const update = await findUpdate();
      if (update) await promptUpdate(update);
      else toast(t("update.upToDate"), "success");
    } catch (e) {
      toast(t("update.checkFailed", { error: errorMessage(e) }), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Row label={t("settings.desktop.version")} description={t("settings.desktop.versionDesc", { version })}>
      <Button icon={busy ? Loader2 : RefreshCw} disabled={busy} onClick={checkNow}>
        {t("settings.desktop.checkUpdates")}
      </Button>
    </Row>
  );
}

function DesktopSection({ draft: { settings: s }, set }: SectionProps) {
  if (!isTauri) return <p className="text-xs font-medium text-fg-3 pt-4">{t("errors.desktop_only")}</p>;
  return (
    <>
      <UpdateRow />
      <Row label={t("settings.desktop.autoUpdate")} description={t("settings.desktop.autoUpdateDesc")}>
        <Switch checked={s.autoUpdate} onCheckedChange={(autoUpdate) => set({ autoUpdate })} />
      </Row>
      <AutostartRow />
      <Row label={t("settings.desktop.tray")} description={t("settings.desktop.trayDesc")}>
        <Switch checked={s.closeToTray} onCheckedChange={(closeToTray) => set({ closeToTray })} />
      </Row>
      <Row label={t("settings.desktop.shortcut")} description={t("settings.desktop.shortcutDesc")}>
        <Select
          value={s.globalShortcut}
          onValueChange={(globalShortcut) => set({ globalShortcut })}
          options={[{ value: "", label: t("settings.desktop.shortcutOff") }, ...SHORTCUTS.map((value) => ({ value, label: shortcutLabel(value) }))]}
        />
      </Row>
      <Row label={t("settings.desktop.autotype")} description={t("settings.desktop.autotypeDesc")}>
        <div className="flex items-center gap-2 text-xs font-medium text-fg-2">
          <Keyboard size={15} className="text-fg-3" />
          <kbd className="px-1.5 h-5 inline-flex items-center rounded bg-subtle border border-line text-[11px] font-semibold">Ctrl + Enter</kbd>
          {t("settings.desktop.autotypeKey")}
        </div>
      </Row>
    </>
  );
}

function BrowserSection({ draft: { settings: s }, set }: SectionProps) {
  const { data, toast } = useVault();
  const [clients, setClients] = useState<BrowserClient[] | null>(null);
  const load = () => api.browserClients().then(setClients).catch(() => setClients([]));
  useEffect(() => {
    void load();
  }, []);

  const revoke = async (c: BrowserClient) => {
    try {
      await api.browserRevoke(c.id);
      toast(t("settings.browser.revoked", { name: c.name }), "success");
      void load();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  if (!isTauri) return <p className="text-xs font-medium text-fg-3 pt-4">{t("errors.desktop_only")}</p>;
  const running = data.settings.browserIntegration;
  return (
    <>
      <Row label={t("settings.browser.enable")} description={t("settings.browser.enableDesc", { port: BROWSER_PORT })}>
        <Switch checked={s.browserIntegration} onCheckedChange={(browserIntegration) => set({ browserIntegration })} />
      </Row>
      <Row
        label={t("settings.browser.clients")}
        description={t("settings.browser.clientsDesc")}
      >
        {!clients ? (
          <Loader2 size={16} className="animate-spin text-fg-3" />
        ) : clients.length === 0 ? (
          <span className="text-xs font-medium text-fg-3">{t(running ? "settings.browser.noClients" : "settings.browser.enableFirst")}</span>
        ) : (
          <div className="flex flex-col rounded-lg border border-line divide-y divide-line">
            {clients.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                <Puzzle size={15} className="text-fg-3 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-fg truncate">{c.name}</div>
                  <div className="text-xs font-medium text-fg-3">
                    {t("settings.browser.pairedAt", { date: formatDate(new Date(c.createdAt).toISOString().slice(0, 10)) })} · {t("settings.browser.lastUsed", { when: relativeTime(new Date(c.lastUsed).toISOString()) })}
                  </div>
                </div>
                <IconButton icon={Trash2} label={t("settings.browser.revoke")} onClick={() => revoke(c)} />
              </div>
            ))}
          </div>
        )}
      </Row>
      <Row label={t("settings.browser.install")} description={t("settings.browser.installDesc")}>
        <ol className="list-decimal pl-5 flex flex-col gap-1 text-xs font-medium text-fg-2">
          <li>{t("settings.browser.step1")}</li>
          <li>{t("settings.browser.step2")}</li>
          <li>{t("settings.browser.step3")}</li>
        </ol>
      </Row>
    </>
  );
}

function SubscriptionsSection({ draft, setDraft, set }: SectionProps & { setDraft: (fn: (d: Draft) => Draft) => void }) {
  const { data, update, toast } = useVault();
  const s = draft.settings;
  const [fetching, setFetching] = useState(false);

  const updateRates = async () => {
    setFetching(true);
    try {
      const { rates, missing } = await fetchRates(s.rates);
      set({ rates });
      update((d) => ({ ...d, ratesUpdatedAt: new Date().toISOString(), settings: { ...d.settings, rates: { ...d.settings.rates, ...rates } } }));
      toast(missing.length ? t("settings.subscriptions.ratesPartial", { list: missing.join(", ") }) : t("settings.subscriptions.ratesUpdated"), "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setFetching(false);
    }
  };
  const [newCurrency, setNewCurrency] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const usedCurrencies = new Set(data.subscriptions.map((x) => x.currency));
  const usedCategories = new Set(data.subscriptions.map((x) => x.category));

  return (
    <>
      <Row label={t("settings.subscriptions.autoRates")} description={t("settings.subscriptions.autoRatesDesc")}>
        <div className="flex items-center gap-3">
          <Switch checked={s.autoRates} onCheckedChange={(autoRates) => set({ autoRates })} />
          <Button size="sm" icon={fetching ? undefined : RefreshCw} onClick={updateRates} disabled={fetching}>
            {fetching && <Loader2 size={14} className="animate-spin" />}
            {t("settings.subscriptions.updateNow")}
          </Button>
          {data.ratesUpdatedAt && <span className="text-xs font-medium text-fg-3">{t("settings.subscriptions.ratesWhen", { when: relativeTime(data.ratesUpdatedAt) })}</span>}
        </div>
      </Row>
      <Row label={t("settings.subscriptions.rates")} description={t("settings.subscriptions.ratesDesc")}>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(s.rates)
            .filter(([c]) => c !== "TRY")
            .map(([c, rate]) => (
              <div key={c} className="flex items-center gap-2">
                <span className="w-11 text-sm font-semibold text-fg shrink-0">{c}</span>
                <Input type="number" step="0.01" min={0} value={rate} onChange={(e) => set({ rates: { ...s.rates, [c]: e.target.valueAsNumber || 0 } })} className="tabular-nums" />
                {!["USD", "EUR"].includes(c) && !usedCurrencies.has(c) && c !== s.baseCurrency && (
                  <IconButton
                    icon={X}
                    label={t("common.remove")}
                    onClick={() => {
                      const { [c]: _removed, ...rest } = s.rates;
                      set({ rates: rest });
                    }}
                  />
                )}
              </div>
            ))}
        </div>
        <div className="flex gap-2 mt-3">
          <Input value={newCurrency} onChange={(e) => setNewCurrency(e.target.value.toUpperCase().slice(0, 3))} placeholder={t("settings.subscriptions.currencyPlaceholder")} className="w-28" />
          <Button
            icon={Plus}
            disabled={newCurrency.length !== 3 || newCurrency in s.rates}
            onClick={() => {
              set({ rates: { ...s.rates, [newCurrency]: 1 } });
              setNewCurrency("");
            }}
          >
            {t("settings.subscriptions.addCurrency")}
          </Button>
        </div>
      </Row>
      <Row label={t("settings.subscriptions.categories")} description={t("settings.subscriptions.categoriesDesc")}>
        <div className="flex flex-wrap gap-1.5">
          {draft.categories.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-md bg-subtle text-[13px] font-medium text-fg-2">
              {c}
              {usedCategories.has(c) ? (
                <span className="w-1" />
              ) : (
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, categories: d.categories.filter((x) => x !== c) }))}
                  className="w-5 h-5 flex items-center justify-center rounded text-fg-4 hover:text-fg cursor-pointer"
                  aria-label={t("common.remove")}
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder={t("subs.newCategory")} className="w-56" />
          <Button
            icon={Plus}
            disabled={!newCategory.trim() || draft.categories.includes(newCategory.trim())}
            onClick={() => {
              setDraft((d) => ({ ...d, categories: [...d.categories, newCategory.trim()] }));
              setNewCategory("");
            }}
          >
            {t("common.add")}
          </Button>
        </div>
      </Row>
    </>
  );
}

function BackupSection({ draft: { settings: s }, set }: SectionProps) {
  const { data, update, replaceData, toast } = useVault();
  const [importPath, setImportPath] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [otherImport, setOtherImport] = useState<ParsedImport | null>(null);
  const filters = [{ name: t("settings.backup.fileType"), extensions: ["keyra"] }];

  const chooseFolder = async () => {
    try {
      const dir = await openDialog({ directory: true, defaultPath: s.autoBackupDir || undefined });
      if (typeof dir === "string") set({ autoBackupDir: dir });
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const backupNow = async () => {
    setBackingUp(true);
    try {
      const at = await writeAutoBackup(s.autoBackupDir, s.autoBackupKeep);
      update((d) => ({ ...d, lastAutoBackup: at }));
      toast(t("settings.backup.autoDone"), "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBackingUp(false);
    }
  };

  const pickOther = async () => {
    try {
      const path = await openDialog({ multiple: false, filters: [{ name: t("settings.backup.otherFileType"), extensions: ["csv", "json"] }] });
      if (typeof path !== "string") return;
      setOtherImport(parseExport(await api.readTextFile(path)));
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const exportBackup = async () => {
    try {
      const path = await saveDialog({ defaultPath: `keyra-${t("settings.backup.fileSlug")}-${todayKey()}.keyra`, filters });
      if (!path) return;
      await api.exportTo(path);
      toast(t("settings.backup.exported"), "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const pickImport = async () => {
    try {
      const path = await openDialog({ multiple: false, filters });
      if (typeof path === "string") setImportPath(path);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <>
      <Row label={t("settings.backup.export")} description={t("settings.backup.exportDesc")}>
        <Button icon={Download} onClick={exportBackup} disabled={!isTauri}>
          {t("settings.backup.exportButton")}
        </Button>
      </Row>
      <Row label={t("settings.backup.import")} description={t("settings.backup.importDesc")}>
        <Button icon={Upload} onClick={pickImport} disabled={!isTauri}>
          {t("settings.backup.importButton")}
        </Button>
      </Row>
      <Row label={t("settings.backup.auto")} description={t("settings.backup.autoDesc")}>
        <div className="flex flex-col gap-3">
          <Select
            value={String(s.autoBackupDays)}
            onValueChange={(v) => set({ autoBackupDays: Number(v) })}
            options={[
              { value: "0", label: t("settings.backup.autoOff") },
              { value: "1", label: t("settings.backup.autoDaily") },
              { value: "7", label: t("settings.backup.autoWeekly") },
              { value: "30", label: t("settings.backup.autoMonthly") },
            ]}
          />
          <Field label={t("settings.backup.autoFolder")}>
            <div className="flex items-center gap-2 min-w-0">
              <Button icon={FolderOpen} onClick={chooseFolder} disabled={!isTauri}>
                {t("settings.backup.chooseFolder")}
              </Button>
              <span className={cn("text-xs font-medium truncate", s.autoBackupDir ? "font-mono text-fg-2" : "text-fg-3")} title={s.autoBackupDir}>
                {s.autoBackupDir || t("settings.backup.noFolder")}
              </span>
            </div>
          </Field>
          <Field label={t("settings.backup.autoKeep")} hint={t("settings.backup.autoKeepDesc")}>
            <Select
              value={String(s.autoBackupKeep)}
              onValueChange={(v) => set({ autoBackupKeep: Number(v) })}
              options={[3, 5, 10, 20, 30].map((n) => ({ value: String(n), label: t("settings.backup.keepCount", { count: n }) }))}
            />
          </Field>
          <div className="flex items-center gap-3">
            <Button icon={backingUp ? undefined : Save} onClick={backupNow} disabled={!isTauri || !s.autoBackupDir || backingUp}>
              {backingUp && <Loader2 size={15} className="animate-spin" />}
              {t("settings.backup.autoNow")}
            </Button>
            <span className="text-xs font-medium text-fg-3">
              {data.lastAutoBackup ? t("settings.backup.autoLast", { when: relativeTime(data.lastAutoBackup) }) : t("settings.backup.autoNever")}
            </span>
          </div>
        </div>
      </Row>
      <Row label={t("settings.backup.other")} description={t("settings.backup.otherDesc")}>
        <Button icon={FileInput} onClick={pickOther} disabled={!isTauri}>
          {t("settings.backup.otherButton")}
        </Button>
      </Row>
      <Row label={t("settings.backup.clear")} description={t("settings.backup.clearDesc")}>
        <Button variant="danger" icon={Trash2} onClick={() => setConfirmClear(true)}>
          {t("settings.backup.clearButton")}
        </Button>
      </Row>
      {!isTauri && <p className="text-xs font-medium text-fg-3 pt-2">{t("errors.desktop_only")}</p>}

      <ConfirmModal
        open={confirmClear}
        title={t("settings.backup.clearTitle")}
        message={t("settings.backup.clearConfirm")}
        confirmLabel={t("settings.backup.clearButton")}
        onConfirm={() => update((d) => ({ ...d, subscriptions: d.subscriptions.map((x) => ({ ...x, payments: [] })) }))}
        onClose={() => setConfirmClear(false)}
      />
      {otherImport && (
        <OtherImportModal
          parsed={otherImport}
          onClose={() => setOtherImport(null)}
          onImport={() => {
            const result = mergeImport(data, otherImport);
            update(() => result.data);
            setOtherImport(null);
            toast(t("settings.backup.otherImported", { count: result.added }), "success");
          }}
        />
      )}
      {importPath && (
        <ImportModal
          path={importPath}
          onClose={() => setImportPath(null)}
          onDone={(json) => {
            const restored = migrate(JSON.parse(json));
            const subs = reconcile(restored.subscriptions);
            replaceData(restored);
            if (subs) update((d) => ({ ...d, subscriptions: subs }));
            setImportPath(null);
            toast(t("settings.backup.restored"), "success");
          }}
        />
      )}
    </>
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useVault();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError("");
    onClose();
  };

  const submit = async () => {
    setError("");
    if (next.length < 8) return setError(t("lock.tooShort"));
    if (next !== confirm) return setError(t("lock.mismatch"));
    setBusy(true);
    try {
      await api.changePassword(current, next);
      toast(t("settings.security.changed"), "success");
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={t("settings.security.changeTitle")}
      width="sm:max-w-md"
      footer={
        <>
          <Button onClick={close}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={submit} disabled={busy || !current || !next}>
            {busy ? t("settings.security.encrypting") : t("settings.security.change")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label={t("settings.security.current")}>
          <SecretInput value={current} onChange={setCurrent} autoFocus />
        </Field>
        <Field label={t("settings.security.new")}>
          <SecretInput value={next} onChange={setNext} />
        </Field>
        <Field label={t("settings.security.newRepeat")}>
          <SecretInput value={confirm} onChange={setConfirm} />
        </Field>
        <p className="text-xs text-fg-3">{t("settings.security.oldBackups")}</p>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const { deleteAccount } = useVault();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      await deleteAccount(password);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t("settings.security.deleteTitle")}
      width="sm:max-w-md"
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="danger" onClick={submit} disabled={busy || !password}>
            {busy ? t("settings.security.deleting") : t("settings.security.deleteButton")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-2">{t("settings.security.deleteConfirm")}</p>
        <Field label={t("settings.security.deletePassword")}>
          <SecretInput value={password} onChange={setPassword} autoFocus />
        </Field>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}

const SOURCE_NAMES: Record<ImportSource, string> = {
  bitwarden: "Bitwarden",
  chrome: "Chrome / Edge",
  firefox: "Firefox",
  onepassword: "1Password",
  keepass: "KeePass",
  lastpass: "LastPass",
  dashlane: "Dashlane",
  csv: "CSV",
};

function OtherImportModal({ parsed, onClose, onImport }: { parsed: ParsedImport; onClose: () => void; onImport: () => void }) {
  const { data } = useVault();
  const preview = mergeImport(data, parsed);
  const byType = new Map<string, number>();
  for (const { item } of parsed.entries) byType.set(item.type, (byType.get(item.type) ?? 0) + 1);

  return (
    <Modal
      open
      onClose={onClose}
      title={t("settings.backup.otherTitle")}
      width="sm:max-w-md"
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={onImport} disabled={!preview.added}>
            {t("settings.backup.otherImport", { count: preview.added })}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-2">{t("settings.backup.otherFound", { source: SOURCE_NAMES[parsed.source] })}</p>
        <div className="flex flex-col rounded-lg border border-line">
          {[...byType].map(([type, count]) => (
            <div key={type} className="flex items-center justify-between px-3 py-2 border-b border-line last:border-b-0 text-sm">
              <span className="font-medium text-fg">{t(`itemType.${type}` as TKey)}</span>
              <span className="font-semibold text-fg tabular-nums">{count}</span>
            </div>
          ))}
        </div>
        {preview.duplicates > 0 && (
          <p className="text-xs font-medium text-fg-3">{preview.added ? t("settings.backup.otherDuplicates", { count: preview.duplicates }) : t("settings.backup.otherNothing")}</p>
        )}
        <p className="rounded-lg bg-amber-500/10 p-3 text-xs font-medium text-amber-800 dark:text-amber-300">{t("settings.backup.otherDelete")}</p>
      </div>
    </Modal>
  );
}

function ImportModal({ path, onClose, onDone }: { path: string; onClose: () => void; onDone: (json: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      onDone(await api.importFrom(path, password));
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={t("settings.backup.importTitle")}
      width="sm:max-w-md"
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="danger" onClick={submit} disabled={busy || !password}>
            {busy ? t("lock.opening") : t("settings.backup.importButton")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-fg-2">{t("settings.backup.importWarning")}</p>
        <p className="text-xs font-mono text-fg-3 break-all">{path}</p>
        <Field label={t("settings.backup.importPassword")}>
          <SecretInput value={password} onChange={setPassword} autoFocus />
        </Field>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      </div>
    </Modal>
  );
}
