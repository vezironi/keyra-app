import { getLocale } from "@/i18n";

export const uid = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

/** 1536 -> "1.5 KB". */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${new Intl.NumberFormat(getLocale(), { maximumFractionDigits: unit ? 1 : 0 }).format(value)} ${units[unit]}`;
}

/** Local calendar date as YYYY-MM-DD (never UTC, so dates don't shift near midnight). */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const todayKey = () => toDateKey(new Date());

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((parseDateKey(toKey).getTime() - parseDateKey(fromKey).getTime()) / 86_400_000);
}

export type DateFormat = "long" | "dmy" | "mdy" | "ymd";

let dateFormat: DateFormat = "long";
/** Set from the user's settings; read by every date formatter below. */
export function setDateFormat(f: DateFormat) {
  dateFormat = f;
}

const capitalize = (s: string) => s.charAt(0).toLocaleUpperCase(getLocale()) + s.slice(1);

/** Formats a date key with the user's chosen format (long name or numeric). */
export function formatDate(key: string, format: DateFormat = dateFormat): string {
  if (!key) return "—";
  const d = parseDateKey(key);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  switch (format) {
    case "dmy":
      return `${dd}/${mm}/${d.getFullYear()}`;
    case "mdy":
      return `${mm}/${dd}/${d.getFullYear()}`;
    case "ymd":
      return key;
    default:
      return new Intl.DateTimeFormat(getLocale(), { day: "numeric", month: "long", year: "numeric" }).format(d);
  }
}

export const formatShortDate = (key: string) => (key ? new Intl.DateTimeFormat(getLocale(), { day: "numeric", month: "short" }).format(parseDateKey(key)) : "—");

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(getLocale(), { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** "Today", "Tomorrow", "In 5 days", "3 days ago" in the UI language. */
export function relativeDays(days: number): string {
  return capitalize(new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" }).format(days, "day"));
}

export function relativeTime(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat(getLocale(), { numeric: "auto" });
  if (days < 30) return rtf.format(-days, "day");
  if (days < 365) return rtf.format(-Math.floor(days / 30), "month");
  return rtf.format(-Math.floor(days / 365), "year");
}

export function hostname(url: string): string {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toLocaleUpperCase(getLocale()) || "?"
  );
}

export function maskCardNumber(num: string): string {
  const digits = num.replace(/\D/g, "");
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : "••••";
}

export function groupCardNumber(num: string): string {
  return num.replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim();
}

export function detectCardBrand(num: string): string {
  const n = num.replace(/\D/g, "");
  if (/^4/.test(n)) return "Visa";
  if (/^(5[1-5]|2[2-7])/.test(n)) return "Mastercard";
  if (/^3[47]/.test(n)) return "Amex";
  if (/^(9792|65)/.test(n)) return "Troy";
  if (/^6(011|5)/.test(n)) return "Discover";
  return "";
}

export function luhnValid(num: string): boolean {
  const n = num.replace(/\D/g, "");
  if (n.length < 12) return false;
  let sum = 0;
  for (let i = 0; i < n.length; i++) {
    let d = Number(n[n.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export { cn } from "./utils";

/**
 * Folds case and diacritics for search, so "sifre" finds "Şifre" and "insta" finds
 * "Instagram" regardless of the UI language (Turkish dotless ı is folded to i).
 */
export function searchKey(s: string): string {
  return s
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** 0.33 \u2192 "%33" in Turkish, "33%" in English. */
export const formatPercent = (ratio: number) => new Intl.NumberFormat(getLocale(), { style: "percent", maximumFractionDigits: 0 }).format(ratio);

export const formatMonth = (key: string, style: "short" | "long" = "short") =>
  new Intl.DateTimeFormat(getLocale(), style === "short" ? { month: "short" } : { month: "long", year: "numeric" }).format(new Date(`${key.slice(0, 7)}-01T00:00:00`));
