import { invoke } from "@tauri-apps/api/core";
import { t, tDynamic } from "@/i18n";
import { DEMO_PASSWORD, DEMO_STORAGE_KEY, demoVault, isDemo } from "./demo";

export interface VaultStatus {
  exists: boolean;
  unlocked: boolean;
  path: string;
}

export interface HelloStatus {
  available: boolean;
  enabled: boolean;
}

export interface AttachmentMeta {
  id: string;
  name: string;
  size: number;
}

export interface ShellConfig {
  closeToTray: boolean;
  shortcut: string;
  labels: { open: string; search: string; lock: string; quit: string };
}

/** A browser paired with the extension bridge (src-tauri/src/browser.rs). */
export interface BrowserClient {
  id: string;
  name: string;
  createdAt: number;
  lastUsed: number;
}

export const BROWSER_PORT = 47390;

export type AutotypeStep = { kind: "text"; value: string } | { kind: "key"; value: "tab" | "enter" };

export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Browser-only stand-in for the Rust backend so the UI can be developed with plain
 * `pnpm dev`. It stores the vault UNENCRYPTED in localStorage and is never used
 * inside the Tauri app.
 */
const mock = {
  // The web demo keeps its sample vault per tab, so closing the tab resets it.
  key: isDemo ? DEMO_STORAGE_KEY : "keyra-dev-vault",
  storage: (): Storage => (isDemo ? sessionStorage : localStorage),
  status(): VaultStatus {
    if (isDemo && this.storage().getItem(this.key) === null) this.write(DEMO_PASSWORD, JSON.stringify(demoVault()));
    return { exists: this.storage().getItem(this.key) !== null, unlocked: false, path: isDemo ? "sessionStorage (demo)" : "localStorage (dev)" };
  },
  read(password: string): string {
    const raw = JSON.parse(this.storage().getItem(this.key) ?? "null");
    if (!raw || raw.password !== password) throw "wrong_password";
    return raw.data;
  },
  write(password: string, data: string) {
    this.storage().setItem(this.key, JSON.stringify({ password, data }));
  },
  password: "",
};

export const api = {
  status: (): Promise<VaultStatus> => (isTauri ? invoke("vault_status") : Promise.resolve(mock.status())),

  create: async (password: string, data: string): Promise<void> => {
    if (isTauri) return invoke("vault_create", { password, data });
    if (password.length < 8) throw "password_too_short";
    mock.password = password;
    mock.write(password, data);
  },

  unlock: async (password: string): Promise<string> => {
    if (isTauri) return invoke("vault_unlock", { password });
    const data = mock.read(password);
    mock.password = password;
    return data;
  },

  lock: async (): Promise<void> => {
    if (isTauri) return invoke("vault_lock");
    mock.password = "";
  },

  save: async (data: string): Promise<void> => {
    if (isTauri) return invoke("vault_save", { data });
    mock.write(mock.password, data);
  },

  changePassword: async (current: string, next: string): Promise<void> => {
    if (isTauri) return invoke("vault_change_password", { current, next });
    const data = mock.read(current);
    if (next.length < 8) throw "password_too_short";
    mock.password = next;
    mock.write(next, data);
  },

  exportTo: async (path: string): Promise<void> => {
    if (isTauri) return invoke("vault_export", { path });
    throw "desktop_only";
  },

  /** Permanently deletes the vault after verifying the master password. */
  deleteVault: async (password: string): Promise<void> => {
    if (isTauri) return invoke("vault_delete", { password });
    if (isDemo) throw "demo_disabled";
    mock.read(password);
    localStorage.removeItem(mock.key);
    mock.password = "";
  },

  /** Writes a dated copy of the encrypted vault into `dir`, keeping the newest `keep` copies. */
  backupAuto: async (dir: string, stamp: string, keep: number): Promise<string> => {
    if (isTauri) return invoke("vault_backup_auto", { dir, stamp, keep });
    throw "desktop_only";
  },

  /** Reads a file the user picked, e.g. an export from another password manager. */
  readTextFile: async (path: string): Promise<string> => {
    if (isTauri) return invoke("read_text_file", { path });
    throw "desktop_only";
  },

  helloStatus: async (): Promise<HelloStatus> => (isTauri ? invoke("hello_status") : { available: false, enabled: false }),

  /** Shows a Windows Hello prompt, then stores the vault key for Hello unlock. */
  helloEnable: (message: string): Promise<void> => invoke("hello_enable", { message }),

  helloDisable: (): Promise<void> => invoke("hello_disable"),

  helloUnlock: (message: string): Promise<string> => invoke("hello_unlock", { message }),

  /** Encrypts the file at `path` into the vault's attachment store. */
  attachmentAdd: async (path: string): Promise<AttachmentMeta> => {
    if (isTauri) return invoke("attachment_add", { path });
    throw "desktop_only";
  },

  /** Decrypts an attachment to `path`. */
  attachmentSave: async (id: string, path: string): Promise<void> => {
    if (isTauri) return invoke("attachment_save", { id, path });
    throw "desktop_only";
  },

  attachmentDelete: async (id: string): Promise<void> => {
    if (isTauri) return invoke("attachment_delete", { id });
  },

  /** Tray, close-to-tray and global shortcut preferences. */
  shellConfigure: async (config: ShellConfig): Promise<void> => {
    if (isTauri) return invoke("shell_configure", { config });
  },

  /** Types the steps into the previously active window. */
  autotype: async (steps: AutotypeStep[]): Promise<void> => {
    if (isTauri) return invoke("autotype", { steps });
    throw "desktop_only";
  },

  /** Starts or stops the local server the browser extension talks to. */
  browserConfigure: async (enabled: boolean): Promise<void> => {
    if (isTauri) return invoke("browser_configure", { enabled });
  },

  /** Answers a `browser://request` or `browser://pair` event. */
  browserReply: (id: string, response: { result?: unknown; error?: string }): Promise<void> => invoke("browser_reply", { id, response }),

  browserClients: async (): Promise<BrowserClient[]> => (isTauri ? invoke("browser_clients") : []),

  browserRevoke: (id: string): Promise<void> => invoke("browser_revoke", { id }),

  importFrom: async (path: string, password: string): Promise<string> => {
    if (isTauri) return invoke("vault_import", { path, password });
    throw "desktop_only";
  },
};

/**
 * The backend reports errors as stable codes (`wrong_password`, or `write_failed:<os detail>`),
 * which are translated here so messages follow the UI language.
 */
export function errorMessage(e: unknown): string {
  const raw = typeof e === "string" ? e : e instanceof Error ? e.message : "";
  if (!raw) return t("errors.unknown");
  const [code, ...rest] = raw.split(":");
  const detail = rest.join(":").trim();
  const text = tDynamic(`errors.${code}`, "");
  if (!text) return raw;
  return detail ? `${text}: ${detail}` : text;
}
