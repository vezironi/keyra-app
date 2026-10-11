/**
 * Exchange rates from the European Central Bank via Frankfurter (no key, no account).
 * Keyra stores rates as "1 unit = X TRY", so they are fetched with TRY as the base
 * and inverted. Currencies the ECB doesn't publish keep their manual rate.
 */

const API = "https://api.frankfurter.dev/v1/latest?base=TRY";
const DAY = 86_400_000;

export interface FetchedRates {
  rates: Record<string, number>;
  /** Currencies that weren't in the response (left unchanged). */
  missing: string[];
}

export async function fetchRates(current: Record<string, number>): Promise<FetchedRates> {
  let res: Response;
  try {
    res = await fetch(API);
  } catch {
    throw "rates_offline";
  }
  if (!res.ok) throw `rates_failed:HTTP ${res.status}`;
  const json = (await res.json()) as { rates?: Record<string, number> };
  if (!json.rates) throw "rates_failed";

  const rates: Record<string, number> = { ...current, TRY: 1 };
  const missing: string[] = [];
  for (const code of Object.keys(current)) {
    if (code === "TRY") continue;
    const perTry = json.rates[code];
    if (perTry > 0) rates[code] = Math.round((1 / perTry) * 10_000) / 10_000;
    else missing.push(code);
  }
  return { rates, missing };
}

/** Automatic updates run at most once every 12 hours. */
export const ratesDue = (updatedAt: string) => !updatedAt || Date.now() - new Date(updatedAt).getTime() > DAY / 2;
