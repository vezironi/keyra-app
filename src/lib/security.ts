import type { CardItem, LoginItem, VaultData } from "./types";
import { passwordStrength } from "./password";
import { freshBreach } from "./breach";

const DAY = 86_400_000;

export interface SecurityReport {
  logins: LoginItem[];
  weak: LoginItem[];
  reused: { password: string; items: LoginItem[] }[];
  reusedIds: Set<string>;
  old: LoginItem[];
  no2fa: LoginItem[];
  empty: LoginItem[];
  insecureUrl: LoginItem[];
  expiringCards: CardItem[];
  /** Logins whose password appears in known breaches (last check still valid). */
  breached: LoginItem[];
  /** Logins with a password that hasn't been checked since it last changed. */
  breachUnchecked: number;
  /** 0-100, share of logins with no weak/reused/old issue. */
  score: number;
}

export function analyze(data: VaultData): SecurityReport {
  const logins = data.items.filter((i): i is LoginItem => i.type === "login");
  const withPw = logins.filter((l) => l.password);

  const weak = withPw.filter((l) => passwordStrength(l.password).score <= 1);

  const groups = new Map<string, LoginItem[]>();
  for (const l of withPw) groups.set(l.password, [...(groups.get(l.password) ?? []), l]);
  const reused = [...groups.entries()].filter(([, items]) => items.length > 1).map(([password, items]) => ({ password, items }));
  const reusedIds = new Set(reused.flatMap((r) => r.items.map((i) => i.id)));

  const old = withPw.filter((l) => Date.now() - new Date(l.passwordUpdatedAt).getTime() > 365 * DAY);
  const no2fa = withPw.filter((l) => !l.totp.trim());
  const empty = logins.filter((l) => !l.password);
  const insecureUrl = logins.filter((l) => l.urls.some((u) => u.trim().toLowerCase().startsWith("http://")));

  const now = new Date();
  const expiringCards = data.items.filter((i): i is CardItem => {
    if (i.type !== "card" || !i.expMonth || !i.expYear) return false;
    const y = Number(i.expYear) < 100 ? Number(i.expYear) + 2000 : Number(i.expYear);
    const months = (y - now.getFullYear()) * 12 + (Number(i.expMonth) - (now.getMonth() + 1));
    return months <= 2;
  });

  const breaches = data.breaches ?? {};
  const breached = withPw.filter((l) => (freshBreach(l, breaches)?.count ?? 0) > 0);
  const breachUnchecked = withPw.filter((l) => !freshBreach(l, breaches)).length;

  const weakIds = new Set(weak.map((w) => w.id));
  const oldIds = new Set(old.map((o) => o.id));
  const breachedIds = new Set(breached.map((b) => b.id));
  const healthy = withPw.filter((l) => !weakIds.has(l.id) && !reusedIds.has(l.id) && !oldIds.has(l.id) && !breachedIds.has(l.id)).length;
  const score = withPw.length ? Math.round((healthy / withPw.length) * 100) : 100;

  return { logins, weak, reused, reusedIds, old, no2fa, empty, insecureUrl, expiringCards, breached, breachUnchecked, score };
}
