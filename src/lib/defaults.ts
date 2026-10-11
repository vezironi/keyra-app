import type { CardItem, IdentityItem, ItemType, LoginItem, NoteItem, Subscription, VaultData, VaultItem } from "./types";
import { defaultCategories } from "./subscriptions";
import { nowIso, todayKey, uid } from "./format";
import { getLanguage, t } from "@/i18n";

export function emptyVault(): VaultData {
  return {
    version: 1,
    items: [],
    folders: [],
    subscriptions: [],
    categories: defaultCategories(),
    notified: [],
    lastAutoBackup: "",
    breaches: {},
    trash: [],
    ratesUpdatedAt: "",
    settings: {
      theme: "system",
      autoLockMinutes: 10,
      clipboardClearSeconds: 30,
      baseCurrency: getLanguage() === "tr" ? "TRY" : "USD",
      // Rates as "1 unit = X TRY". Edited in Settings; fetched online only if the user turns on automatic rates.
      rates: { TRY: 1, USD: 41, EUR: 48, GBP: 55 },
      showIcons: true,
      notifications: true,
      notifyTrials: true,
      notifyCardExpiry: true,
      sidebarCollapsed: false,
      language: "system",
      dateFormat: "long",
      font: "manrope",
      autoBackupDays: 0,
      autoBackupDir: "",
      autoBackupKeep: 10,
      autoRates: false,
      closeToTray: false,
      globalShortcut: "CommandOrControl+Shift+Space",
      browserIntegration: false,
    },
  };
}

/** Fills in fields added in later versions so older vault files keep working. */
export function migrate(raw: Partial<VaultData>): VaultData {
  const base = emptyVault();
  return {
    ...base,
    ...raw,
    categories: raw.categories?.length ? raw.categories : base.categories,
    notified: raw.notified ?? [],
    breaches: raw.breaches ?? {},
    trash: raw.trash ?? [],
    items: (raw.items ?? []).map((i) => ({ ...i, attachments: i.attachments ?? [] })),
    subscriptions: (raw.subscriptions ?? []).map((x) => ({ ...x, usage: x.usage ?? "" })),
    settings: { ...base.settings, ...raw.settings, rates: { ...base.settings.rates, ...raw.settings?.rates } },
  } as VaultData;
}

export function newItem(type: ItemType, folderId: string | null = null): VaultItem {
  const base = {
    id: uid(),
    name: "",
    folderId,
    favorite: false,
    notes: "",
    fields: [],
    attachments: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  switch (type) {
    case "login":
      return {
        ...base,
        type,
        username: "",
        password: "",
        urls: [""],
        totp: "",
        passwordUpdatedAt: nowIso(),
        passwordHistory: [],
      } satisfies LoginItem;
    case "card":
      return {
        ...base,
        type,
        cardholder: "",
        number: "",
        brand: "",
        expMonth: "",
        expYear: "",
        cvv: "",
        bank: "",
        color: "graphite",
        kind: "credit",
      } satisfies CardItem;
    case "note":
      return { ...base, type } satisfies NoteItem;
    case "identity":
      return {
        ...base,
        type,
        firstName: "",
        lastName: "",
        email: "",
        phone: "",
        nationalId: "",
        birthDate: "",
        company: "",
        address: "",
        city: "",
        postalCode: "",
        country: t("item.defaultCountry"),
      } satisfies IdentityItem;
  }
}

export function newSubscription(currency: string, category = defaultCategories()[0]): Subscription {
  const today = todayKey();
  return {
    id: uid(),
    name: "",
    url: "",
    category,
    plan: "",
    price: 0,
    currency,
    cycle: "monthly",
    cycleDays: 30,
    startDate: today,
    nextBillingDate: today,
    status: "active",
    trialEndsAt: "",
    cardId: null,
    loginId: null,
    reminderDays: 3,
    notes: "",
    usage: "",
    payments: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    cancelledAt: "",
  };
}
