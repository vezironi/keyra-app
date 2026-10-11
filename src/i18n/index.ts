import { tr, type Dictionary } from "./tr";
import { en } from "./en";

export type Language = "tr" | "en";
export type LanguagePreference = Language | "system";

const DICTIONARIES: Record<Language, Dictionary> = { tr, en };

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: "tr", label: "Türkçe" },
  { value: "en", label: "English" },
];

/** Picks the first supported language from the OS / webview language list. */
export function detectLanguage(): Language {
  const candidates = typeof navigator !== "undefined" ? [...(navigator.languages ?? []), navigator.language] : [];
  for (const tag of candidates) {
    const base = tag?.toLowerCase().split("-")[0];
    if (base === "tr" || base === "en") return base;
  }
  return "en";
}

export function resolveLanguage(pref: LanguagePreference | undefined): Language {
  return !pref || pref === "system" ? detectLanguage() : pref;
}

let current: Language = detectLanguage();

export function setLanguage(lang: Language) {
  current = lang;
  document.documentElement.lang = lang;
}

export const getLanguage = () => current;

/** BCP-47 locale used for Intl formatting and locale-aware lowercasing. */
export const getLocale = () => (current === "tr" ? "tr-TR" : "en-US");

// Dot-separated key paths of the dictionary, e.g. "settings.general.title".
type Paths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${Paths<T[K]>}`;
}[keyof T & string];

/** Strips plural suffixes so `foo_one`/`foo_other` are addressed as `foo`. */
type Base<P extends string> = P extends `${infer B}_one` ? B : P extends `${infer B}_other` ? B : P;

export type TKey = Base<Paths<Dictionary>>;

type Params = Record<string, string | number>;

function lookup(dict: Dictionary, path: string): string | undefined {
  let node: unknown = dict;
  for (const part of path.split(".")) {
    if (node && typeof node === "object" && part in node) node = (node as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * Translates a key in the current language. `{name}` placeholders are filled from
 * params; when `params.count` is given, `key_one` / `key_other` variants are used.
 */
export function t(key: TKey, params?: Params): string {
  const dict = DICTIONARIES[current];
  let text: string | undefined;
  if (params && typeof params.count === "number") {
    text = lookup(dict, `${key}_${params.count === 1 ? "one" : "other"}`);
  }
  text ??= lookup(dict, key) ?? lookup(tr, key) ?? key;
  return params ? text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m)) : text;
}

/** Translates a dynamic key (e.g. built from an enum value), falling back to the raw value. */
export function tDynamic(key: string, fallback?: string): string {
  return lookup(DICTIONARIES[current], key) ?? lookup(tr, key) ?? fallback ?? key;
}
