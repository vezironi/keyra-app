import type { BreachResult, LoginItem } from "./types";
import { nowIso } from "./format";

/**
 * Checks passwords against Have I Been Pwned with k-anonymity: only the first 5
 * characters of each password's SHA-1 hash leave the device, and the match is
 * done locally against the returned list of hash suffixes.
 */

const API = "https://api.pwnedpasswords.com/range/";

async function sha1(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

async function fetchRange(prefix: string): Promise<Map<string, number>> {
  const res = await fetch(API + prefix);
  if (!res.ok) throw `breach_failed:HTTP ${res.status}`;
  const counts = new Map<string, number>();
  for (const line of (await res.text()).split("\n")) {
    const [suffix, count] = line.trim().split(":");
    if (suffix && count) counts.set(suffix, Number(count));
  }
  return counts;
}

/** Returns a result per login id. Each hash prefix is requested only once. */
export async function checkBreaches(logins: LoginItem[], onProgress?: (done: number, total: number) => void): Promise<Record<string, BreachResult>> {
  const hashes = await Promise.all(logins.map((l) => sha1(l.password)));
  const prefixes = [...new Set(hashes.map((h) => h.slice(0, 5)))];
  const ranges = new Map<string, Map<string, number>>();

  let done = 0;
  const queue = [...prefixes];
  const worker = async () => {
    for (let prefix = queue.shift(); prefix; prefix = queue.shift()) {
      try {
        ranges.set(prefix, await fetchRange(prefix));
      } catch (e) {
        if (e instanceof TypeError) throw "breach_offline";
        throw e;
      }
      onProgress?.(++done, prefixes.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, prefixes.length) }, worker));

  const at = nowIso();
  const results: Record<string, BreachResult> = {};
  logins.forEach((l, i) => {
    const h = hashes[i];
    results[l.id] = { at, count: ranges.get(h.slice(0, 5))?.get(h.slice(5)) ?? 0 };
  });
  return results;
}

/** A result only counts while the password hasn't changed since the check. */
export function freshBreach(login: LoginItem, results: Record<string, BreachResult>): BreachResult | null {
  const r = results[login.id];
  if (!r || new Date(r.at).getTime() < new Date(login.passwordUpdatedAt).getTime()) return null;
  return r;
}
