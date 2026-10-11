import { api } from "./api";
import { nowIso } from "./format";

const HOUR = 3_600_000;

/** File-name-safe local timestamp, e.g. 20261011-143005; sorts chronologically. */
function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Due once `days` have passed, with an hour of slack so a daily backup doesn't drift later each day. */
export function backupDue(days: number, dir: string, last: string): boolean {
  if (!days || !dir) return false;
  return !last || Date.now() - new Date(last).getTime() >= days * 24 * HOUR - HOUR;
}

/** Writes an automatic backup and returns its timestamp for `lastAutoBackup`. */
export async function writeAutoBackup(dir: string, keep: number): Promise<string> {
  await api.backupAuto(dir, stamp(), keep);
  return nowIso();
}
