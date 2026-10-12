import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isPermissionGranted, sendNotification } from "@tauri-apps/plugin-notification";
import { toast } from "sonner";
import { t } from "@/i18n";
import { errorMessage, isTauri } from "./api";

/** Releases are signed and published by .github/workflows/release.yml; dev builds never update. */
export const updatesSupported = isTauri && import.meta.env.PROD;

export async function findUpdate(): Promise<Update | null> {
  return updatesSupported ? check() : null;
}

/** Downloads, installs and restarts. On Windows the installer closes the app itself. */
export async function applyUpdate(update: Update): Promise<void> {
  toast.loading(t("update.installing", { version: update.version }), { id: "update", duration: Infinity });
  try {
    await update.downloadAndInstall();
    await relaunch();
  } catch (e) {
    toast.error(t("update.failed", { error: errorMessage(e) }), { id: "update", duration: 10_000 });
  }
}

/** Lets the user decide. The toast id keeps repeated checks from stacking prompts. */
export async function promptUpdate(update: Update): Promise<void> {
  toast(t("update.available", { version: update.version }), {
    id: "update",
    duration: Infinity,
    action: { label: t("update.install"), onClick: () => void applyUpdate(update) },
  });
  // Keyra often runs hidden in the tray, where the toast goes unseen.
  if (document.hidden && (await isPermissionGranted().catch(() => false))) {
    sendNotification({ title: "Keyra", body: t("update.available", { version: update.version }) });
  }
}
