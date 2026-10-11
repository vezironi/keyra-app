import type { BillingCycle, CardItem, IdentityItem, LoginItem, NoteItem, Subscription, SubscriptionStatus, SubscriptionUsage, VaultData, VaultItem } from "./types";
import { emptyVault } from "./defaults";
import { toDateKey } from "./format";
import { getLanguage } from "@/i18n";

/**
 * Web demo build (`pnpm build:demo`, served by keyra-web at /demo). Runs the real UI on
 * the browser mock in api.ts with a pre-filled sample vault, kept only in sessionStorage.
 */
export const isDemo = import.meta.env.MODE === "demo";

export const DEMO_PASSWORD = "keyra-demo";

export const DEMO_STORAGE_KEY = "keyra-demo-vault";

/**
 * Master password of the desktop test account ("Try with a test account" on first run).
 * Deliberately public: the test vault holds only sample data and exists to try the app
 * and the browser extension, which pairs with it without the approval prompt.
 */
export const TEST_PASSWORD = "keyra-test";

/** Drops the visitor's changes and reloads with a fresh sample vault. */
export function resetDemo() {
  try {
    sessionStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  location.reload();
}

/** Where the "download" call-to-action points (the marketing site's download section). */
export const DEMO_DOWNLOAD_URL = "/#indir";

export const DEMO_LIMITS = { items: 15, subscriptions: 12 };

/** True when the demo vault already holds as many entries of this kind as it may. */
export function demoLimitReached(data: VaultData, kind: "items" | "subscriptions"): boolean {
  return isDemo && data[kind].length >= DEMO_LIMITS[kind];
}

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();
const monthsAgoKey = (months: number, day: number) => {
  const now = new Date();
  return toDateKey(new Date(now.getFullYear(), now.getMonth() - months, day));
};
const daysFromNowKey = (n: number) => toDateKey(new Date(Date.now() + n * DAY));

let seq = 0;
const id = () => `demo-${++seq}`;

function base(name: string, extra: { favorite?: boolean; folderId?: string | null; notes?: string; age?: number } = {}) {
  return {
    id: id(),
    name,
    folderId: extra.folderId ?? null,
    favorite: extra.favorite ?? false,
    notes: extra.notes ?? "",
    fields: [],
    attachments: [],
    createdAt: daysAgo(extra.age ?? 120),
    updatedAt: daysAgo(Math.min(extra.age ?? 120, 20)),
  };
}

function login(name: string, username: string, password: string, url: string, opts: { totp?: string; pwAge?: number; favorite?: boolean; folderId?: string | null } = {}): LoginItem {
  return {
    ...base(name, { favorite: opts.favorite, folderId: opts.folderId, age: (opts.pwAge ?? 60) + 10 }),
    type: "login",
    username,
    password,
    urls: [url],
    totp: opts.totp ?? "",
    passwordUpdatedAt: daysAgo(opts.pwAge ?? 60),
    passwordHistory: [],
  };
}

function sub(
  name: string,
  url: string,
  category: string,
  plan: string,
  price: number,
  currency: string,
  cycle: BillingCycle,
  monthsAgo: number,
  opts: { status?: SubscriptionStatus; usage?: SubscriptionUsage; cardId?: string | null; loginId?: string | null; trialDays?: number } = {},
): Subscription {
  const status = opts.status ?? "active";
  // Billing starts in the past; reconcile() on unlock logs the passed dates as payments.
  const start = opts.trialDays ? daysFromNowKey(opts.trialDays) : monthsAgoKey(monthsAgo, 1 + ((name.length * 7) % 27));
  return {
    id: id(),
    name,
    url,
    category,
    plan,
    price,
    currency,
    cycle,
    cycleDays: 30,
    startDate: start,
    nextBillingDate: start,
    status,
    trialEndsAt: opts.trialDays ? start : "",
    cardId: opts.cardId ?? null,
    loginId: opts.loginId ?? null,
    reminderDays: 3,
    notes: "",
    usage: opts.usage ?? "",
    payments: [],
    createdAt: daysAgo(monthsAgo * 30),
    updatedAt: daysAgo(5),
    cancelledAt: status === "cancelled" ? monthsAgoKey(1, 10) : "",
  };
}

/** The sample vault a demo visitor starts with, written in the UI language. */
export function demoVault(): VaultData {
  seq = 0;
  const tr = getLanguage() === "tr";
  const L = (a: string, b: string) => (tr ? a : b);
  const v = emptyVault();
  const cat = (i: number) => v.categories[i] ?? v.categories[v.categories.length - 1];

  const work = { id: id(), name: L("İş", "Work") };
  const personal = { id: id(), name: L("Kişisel", "Personal") };

  const github = login("GitHub", "deniz.demo", "q7#Lm2!vTz9@Rk4w", "https://github.com", { totp: "JBSWY3DPEHPK3PXP", favorite: true, folderId: work.id, pwAge: 40 });
  const google = login("Google", "deniz.demo@gmail.com", "Kz8$pW3n!Hq6xV2e", "https://accounts.google.com", { totp: "KRSXG5CTMVRXEZLU", favorite: true, folderId: personal.id, pwAge: 90 });
  const netflixLogin = login("Netflix", "deniz.demo@gmail.com", "sunflower2019", "https://netflix.com", { folderId: personal.id, pwAge: 700 });
  const spotifyLogin = login("Spotify", "deniz.demo@gmail.com", "sunflower2019", "https://open.spotify.com", { folderId: personal.id, pwAge: 500 });
  const slack = login("Slack", "deniz@acme.dev", "Tr!9vNc4#xLp7Qe2", "https://acme.slack.com", { folderId: work.id, pwAge: 30 });
  const router = login(L("Ev modemi", "Home router"), "admin", "admin123", "http://192.168.1.1", { pwAge: 900 });
  const openai = login("ChatGPT", "deniz.demo@gmail.com", "Gx4!eV8m#Tq2Lw9z", "https://chatgpt.com", { pwAge: 15 });

  const card1: CardItem = {
    ...base(L("Maaş kartı", "Everyday card"), { favorite: true }),
    type: "card",
    cardholder: "DENIZ DEMO",
    number: "4111111111111111",
    brand: "Visa",
    expMonth: "08",
    expYear: String(new Date().getFullYear() + 2),
    cvv: "123",
    bank: L("Örnek Bank", "Sample Bank"),
    color: "ocean",
    kind: "debit",
  };
  // Expires next month, so the dashboard shows the card-expiry warning.
  const soon = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
  const card2: CardItem = {
    ...base(L("Online alışveriş", "Online shopping")),
    type: "card",
    cardholder: "DENIZ DEMO",
    number: "5555555555554444",
    brand: "Mastercard",
    expMonth: String(soon.getMonth() + 1).padStart(2, "0"),
    expYear: String(soon.getFullYear()),
    cvv: "456",
    bank: L("Dijital Bank", "Digital Bank"),
    color: "violet",
    kind: "virtual",
  };

  const note: NoteItem = {
    ...base(L("Wi-Fi şifreleri", "Wi-Fi passwords"), { folderId: personal.id }),
    type: "note",
    notes: L("Ev: KeyraHome-5G / örnek-parola-123\nOfis misafir: Acme-Guest / hosgeldin2026", "Home: KeyraHome-5G / sample-password-123\nOffice guest: Acme-Guest / welcome2026"),
  };

  const identity: IdentityItem = {
    ...base(L("Kimlik bilgilerim", "My identity")),
    type: "identity",
    firstName: "Deniz",
    lastName: "Demo",
    email: "deniz.demo@gmail.com",
    phone: "+90 555 000 00 00",
    nationalId: "",
    birthDate: "1994-05-12",
    company: "Acme",
    address: L("Örnek Mah. Demo Sk. No:1", "1 Demo Street"),
    city: L("İstanbul", "Istanbul"),
    postalCode: "34000",
    country: L("Türkiye", "Türkiye"),
  };

  const items: VaultItem[] = [github, google, netflixLogin, spotifyLogin, slack, router, openai, card1, card2, note, identity];

  const subscriptions: Subscription[] = [
    sub("Netflix", "https://netflix.com", cat(0), "Standard", 229.99, "TRY", "monthly", 8, { usage: "often", cardId: card1.id, loginId: netflixLogin.id }),
    sub("Spotify", "https://spotify.com", cat(1), "Premium Duo", 99, "TRY", "monthly", 11, { usage: "often", cardId: card1.id, loginId: spotifyLogin.id }),
    sub("YouTube Premium", "https://youtube.com", cat(0), L("Bireysel", "Individual"), 79.99, "TRY", "monthly", 6, { usage: "sometimes", cardId: card2.id }),
    sub("iCloud+", "https://icloud.com", cat(3), "200 GB", 39.99, "TRY", "monthly", 12, { usage: "often", cardId: card1.id }),
    sub("ChatGPT Plus", "https://chatgpt.com", cat(4), "Plus", 20, "USD", "monthly", 5, { usage: "often", cardId: card2.id, loginId: openai.id }),
    sub("GitHub Copilot", "https://github.com", cat(2), "Pro", 100, "USD", "yearly", 7, { usage: "often", cardId: card2.id, loginId: github.id }),
    sub("Adobe Creative Cloud", "https://adobe.com", cat(2), "Photography", 11.99, "EUR", "monthly", 9, { usage: "rarely", cardId: card2.id }),
    sub("Xbox Game Pass", "https://xbox.com", cat(5), "Ultimate", 349, "TRY", "monthly", 4, { status: "paused", usage: "rarely" }),
    sub("Disney+", "https://disneyplus.com", cat(0), "Standard", 134.99, "TRY", "monthly", 0, { status: "trial", trialDays: 5 }),
    sub("Duolingo", "https://duolingo.com", cat(7), "Super", 899, "TRY", "yearly", 14, { status: "cancelled", usage: "never" }),
  ];

  return {
    ...v,
    // The site embeds the demo as a live preview; it shouldn't lock itself there.
    settings: { ...v.settings, autoLockMinutes: 0 },
    items,
    folders: [work, personal],
    subscriptions,
    // A recent breach check so the security report has something to show.
    breaches: { [netflixLogin.id]: { at: daysAgo(1), count: 1843 }, [spotifyLogin.id]: { at: daysAgo(1), count: 1843 } },
  };
}

/** The vault behind "Try with a test account": the demo data with the browser bridge switched on. */
export function testVault(): VaultData {
  const v = demoVault();
  return { ...v, test: true, settings: { ...v.settings, browserIntegration: true } };
}
