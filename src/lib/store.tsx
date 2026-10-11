import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { writeText, clear } from "@tauri-apps/plugin-clipboard-manager";
import type { Page, VaultData } from "./types";
import { api, errorMessage, isTauri } from "./api";
import { t } from "@/i18n";

export type SaveState = "saved" | "saving" | "error";

export interface Nav {
  page: Page;
  /** Item or subscription to select when the page opens. */
  focusId?: string;
}

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "success" | "error";
}

interface VaultContextValue {
  data: VaultData;
  update: (fn: (d: VaultData) => VaultData) => void;
  /** Swaps in data that is already persisted (e.g. after restoring a backup). */
  replaceData: (d: VaultData) => void;
  saveState: SaveState;
  nav: Nav;
  navigate: (page: Page, focusId?: string) => void;
  lock: () => void;
  /** Deletes the vault and every setting, then returns to first-run setup. */
  deleteAccount: (password: string) => Promise<void>;
  toast: (message: string, kind?: Toast["kind"]) => void;
  copy: (text: string, label: string) => void;
  openSearch: () => void;
}

const VaultContext = createContext<VaultContextValue | null>(null);

export function useVault(): VaultContextValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error("useVault outside provider");
  return ctx;
}

interface ProviderProps {
  initial: VaultData;
  onLock: () => void;
  onDeleted: () => void;
  toast: VaultContextValue["toast"];
  openSearch: () => void;
  children: ReactNode;
}

export function VaultProvider({ initial, onLock, onDeleted, toast, openSearch, children }: ProviderProps) {
  const [data, setData] = useState(initial);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [nav, setNav] = useState<Nav>({ page: "dashboard" });
  const pending = useRef<VaultData | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const clipTimer = useRef<number | undefined>(undefined);

  const flush = useCallback(async () => {
    const snapshot = pending.current;
    if (!snapshot) return;
    pending.current = null;
    try {
      await api.save(JSON.stringify(snapshot));
      setSaveState(pending.current ? "saving" : "saved");
    } catch (e) {
      setSaveState("error");
      toast(t("toast.saveFailed", { error: errorMessage(e) }), "error");
    }
  }, [toast]);

  const update = useCallback(
    (fn: (d: VaultData) => VaultData) => {
      setData((prev) => {
        const next = fn(prev);
        if (next !== prev) {
          pending.current = next;
          setSaveState("saving");
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(flush, 350);
        }
        return next;
      });
    },
    [flush],
  );

  const replaceData = useCallback((d: VaultData) => {
    window.clearTimeout(timer.current);
    pending.current = null;
    setData(d);
    setSaveState("saved");
  }, []);

  const lock = useCallback(async () => {
    window.clearTimeout(timer.current);
    await flush();
    await api.lock();
    onLock();
  }, [flush, onLock]);

  const deleteAccount = useCallback(
    async (password: string) => {
      // Persist pending edits first so nothing is lost if the password turns out wrong.
      window.clearTimeout(timer.current);
      await flush();
      await api.deleteVault(password);
      window.clearTimeout(clipTimer.current);
      onDeleted();
    },
    [flush, onDeleted],
  );

  const navigate = useCallback((page: Page, focusId?: string) => setNav({ page, focusId }), []);

  const clearSeconds = data.settings.clipboardClearSeconds;
  const copy = useCallback(
    async (text: string, label: string) => {
      if (!text) return;
      try {
        if (isTauri) await writeText(text);
        else await navigator.clipboard.writeText(text);
        toast(clearSeconds > 0 ? t("toast.copiedClears", { label, seconds: clearSeconds }) : t("toast.copied", { label }), "success");
        window.clearTimeout(clipTimer.current);
        if (clearSeconds > 0)
          clipTimer.current = window.setTimeout(() => {
            if (isTauri) clear().catch(() => {});
            else navigator.clipboard.writeText("").catch(() => {});
          }, clearSeconds * 1000);
      } catch (e) {
        toast(t("toast.copyFailed", { error: errorMessage(e) }), "error");
      }
    },
    [toast, clearSeconds],
  );

  // Save before the window closes.
  useEffect(() => {
    const handler = () => void flush();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [flush]);

  return (
    <VaultContext.Provider value={{ data, update, replaceData, saveState, nav, navigate, lock, deleteAccount, toast, copy, openSearch }}>
      {children}
    </VaultContext.Provider>
  );
}
