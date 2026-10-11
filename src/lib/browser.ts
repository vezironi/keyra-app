/**
 * Requests from the Keyra browser extension (see src-tauri/src/browser.rs).
 * Rust authenticates the extension and forwards vault requests here, because the
 * frontend owns the vault data; changes go through the normal save path.
 *
 * List requests return summaries only; secrets are sent for one item at a time,
 * when the user fills or copies it.
 */
import type { CardItem, IdentityItem, LoginItem, VaultData } from "./types";
import { newItem } from "./defaults";
import { siteHost, siteMatch } from "./domain";
import { generateTotp, parseTotp } from "./totp";
import { nowIso } from "./format";

export type BrowserRequest =
  | { type: "logins"; url: string }
  | { type: "items" }
  | { type: "login"; id: string }
  | { type: "totp"; id: string }
  | { type: "card"; id: string }
  | { type: "identity"; id: string }
  /** `currentPassword` comes from change-password forms, which often have no username field. */
  | { type: "check"; url: string; username: string; password: string; currentPassword?: string }
  | { type: "save"; url: string; username: string; password: string }
  | { type: "update"; id: string; password: string; username?: string }
  | { type: "open"; id?: string };

export interface BrowserOutcome {
  result?: unknown;
  error?: string;
  /** Vault change to apply. */
  change?: (d: VaultData) => VaultData;
  /** Toast to show in the app. */
  notice?: { key: "saved" | "updated"; name: string };
  /** Item to show in the app. */
  open?: string;
}

const MAX_FIELD = 4096;

const logins = (d: VaultData) => d.items.filter((i): i is LoginItem => i.type === "login");
const norm = (s: string) => s.trim().toLowerCase();

function loginSummary(l: LoginItem) {
  return { id: l.id, name: l.name, username: l.username, url: l.urls.find(Boolean) ?? "", favorite: l.favorite, hasTotp: !!parseTotp(l.totp) };
}

/** Logins for a page, best match first (same host, then favorites, then name). */
function loginsFor(d: VaultData, url: string) {
  return logins(d)
    .map((l) => ({ l, match: Math.max(0, ...l.urls.map((u) => siteMatch(u, url))) }))
    .filter((x) => x.match > 0)
    .sort((a, b) => b.match - a.match || Number(b.l.favorite) - Number(a.l.favorite) || a.l.name.localeCompare(b.l.name))
    .map((x) => x.l);
}

async function totpOf(l: LoginItem) {
  const cfg = parseTotp(l.totp);
  if (!cfg) return null;
  const now = Date.now();
  return { code: await generateTotp(cfg, now), period: cfg.period, remaining: cfg.period - (Math.floor(now / 1000) % cfg.period) };
}

function cardSummary(c: CardItem) {
  const digits = c.number.replace(/\D/g, "");
  return { id: c.id, name: c.name, brand: c.brand, last4: digits.slice(-4), cardholder: c.cardholder, exp: c.expMonth && c.expYear ? `${c.expMonth.padStart(2, "0")}/${c.expYear.slice(-2)}` : "" };
}

function identitySummary(i: IdentityItem) {
  return { id: i.id, name: i.name, fullName: [i.firstName, i.lastName].filter(Boolean).join(" "), email: i.email };
}

function find<T extends VaultData["items"][number]["type"]>(d: VaultData, id: string, type: T) {
  return d.items.find((i) => i.id === id && i.type === type) as Extract<VaultData["items"][number], { type: T }> | undefined;
}

export async function handleBrowserRequest(req: BrowserRequest, d: VaultData): Promise<BrowserOutcome> {
  switch (req.type) {
    case "logins":
      return { result: loginsFor(d, req.url).map(loginSummary) };

    case "items":
      return {
        result: {
          logins: logins(d).map(loginSummary),
          cards: d.items.filter((i): i is CardItem => i.type === "card").map(cardSummary),
          identities: d.items.filter((i): i is IdentityItem => i.type === "identity").map(identitySummary),
        },
      };

    case "login": {
      const l = find(d, req.id, "login");
      if (!l) return { error: "not_found" };
      return { result: { ...loginSummary(l), password: l.password, totp: await totpOf(l) } };
    }

    case "totp": {
      const l = find(d, req.id, "login");
      const totp = l && (await totpOf(l));
      return totp ? { result: totp } : { error: "not_found" };
    }

    case "card": {
      const c = find(d, req.id, "card");
      if (!c) return { error: "not_found" };
      const { cardholder, number, brand, expMonth, expYear, cvv } = c;
      return { result: { ...cardSummary(c), cardholder, number: number.replace(/\s/g, ""), brand, expMonth, expYear, cvv } };
    }

    case "identity": {
      const i = find(d, req.id, "identity");
      if (!i) return { error: "not_found" };
      const { firstName, lastName, email, phone, nationalId, birthDate, company, address, city, postalCode, country } = i;
      return { result: { ...identitySummary(i), firstName, lastName, email, phone, nationalId, birthDate, company, address, city, postalCode, country } };
    }

    case "check": {
      const site = loginsFor(d, req.url);
      const user = norm(req.username);
      const same = site.filter((l) => norm(l.username) === user);
      if (same.some((l) => l.password === req.password) || (!user && site.some((l) => l.password === req.password))) {
        return { result: { status: "exists" } };
      }
      const changed = same[0] ?? (req.currentPassword ? site.find((l) => l.password === req.currentPassword) : undefined);
      if (changed) return { result: { status: "changed", id: changed.id, name: changed.name } };
      return { result: { status: "new", name: siteHost(req.url) } };
    }

    case "save": {
      const host = siteHost(req.url);
      if (!host || !req.password || req.password.length > MAX_FIELD || req.username.length > MAX_FIELD) return { error: "bad_request" };
      const item = newItem("login") as LoginItem;
      item.name = host;
      item.username = req.username.trim();
      item.password = req.password;
      item.urls = [new URL(req.url).origin];
      return { result: { id: item.id }, change: (x) => ({ ...x, items: [item, ...x.items] }), notice: { key: "saved", name: item.name } };
    }

    case "update": {
      const l = find(d, req.id, "login");
      if (!l) return { error: "not_found" };
      if (!req.password || req.password.length > MAX_FIELD) return { error: "bad_request" };
      const change = (x: VaultData): VaultData => ({
        ...x,
        items: x.items.map((i) => {
          if (i.id !== req.id || i.type !== "login") return i;
          const next = { ...i, updatedAt: nowIso() };
          if (!next.username && req.username) next.username = req.username.trim();
          if (i.password !== req.password) {
            next.password = req.password;
            next.passwordHistory = [...i.passwordHistory, { password: i.password, date: nowIso() }].slice(-10);
            next.passwordUpdatedAt = nowIso();
          }
          return next;
        }),
      });
      return { result: {}, change, notice: { key: "updated", name: l.name } };
    }

    case "open":
      return { result: {}, open: req.id ?? "" };

    default:
      return { error: "bad_request" };
  }
}
