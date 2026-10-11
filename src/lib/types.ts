import type { LanguagePreference } from "@/i18n";
import type { DateFormat } from "./format";

export type ItemType = "login" | "card" | "note" | "identity";

export interface CustomField {
  id: string;
  label: string;
  value: string;
  hidden: boolean;
}

/** An encrypted file stored next to the vault (see src-tauri/src/attachments.rs). */
export interface Attachment {
  id: string;
  name: string;
  size: number;
  addedAt: string;
}

interface BaseItem {
  id: string;
  type: ItemType;
  name: string;
  folderId: string | null;
  favorite: boolean;
  notes: string;
  fields: CustomField[];
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
}

export interface LoginItem extends BaseItem {
  type: "login";
  username: string;
  password: string;
  urls: string[];
  totp: string;
  passwordUpdatedAt: string;
  passwordHistory: { password: string; date: string }[];
}

export type CardColor = "graphite" | "ocean" | "forest" | "sunset" | "violet" | "rose" | "gold";

export interface CardItem extends BaseItem {
  type: "card";
  cardholder: string;
  number: string;
  brand: string;
  expMonth: string;
  expYear: string;
  cvv: string;
  bank: string;
  color: CardColor;
  kind: "credit" | "debit" | "virtual" | "prepaid";
}

export interface NoteItem extends BaseItem {
  type: "note";
}

export interface IdentityItem extends BaseItem {
  type: "identity";
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  nationalId: string;
  birthDate: string;
  company: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
}

export type VaultItem = LoginItem | CardItem | NoteItem | IdentityItem;

/** A deleted item kept in the trash for 30 days. */
export type TrashedItem = VaultItem & { deletedAt: string };

export interface Folder {
  id: string;
  name: string;
}

export type BillingCycle = "weekly" | "monthly" | "quarterly" | "semiannual" | "yearly" | "custom";
export type SubscriptionStatus = "active" | "trial" | "paused" | "cancelled";
/** How much the user says they use a subscription; "" when not rated yet. */
export type SubscriptionUsage = "" | "often" | "sometimes" | "rarely" | "never";

export interface Payment {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  currency: string;
  note: string;
  auto: boolean;
}

export interface Subscription {
  id: string;
  name: string;
  url: string;
  category: string;
  plan: string;
  price: number;
  currency: string;
  cycle: BillingCycle;
  cycleDays: number;
  startDate: string;
  nextBillingDate: string;
  status: SubscriptionStatus;
  trialEndsAt: string;
  cardId: string | null;
  loginId: string | null;
  reminderDays: number;
  notes: string;
  usage: SubscriptionUsage;
  payments: Payment[];
  createdAt: string;
  updatedAt: string;
  cancelledAt: string;
}

export interface Settings {
  theme: "light" | "dark" | "system";
  autoLockMinutes: number;
  clipboardClearSeconds: number;
  baseCurrency: string;
  /** Value of one unit of each currency, expressed in the base currency. */
  rates: Record<string, number>;
  showIcons: boolean;
  /** Renewal reminders for subscriptions. */
  notifications: boolean;
  notifyTrials: boolean;
  notifyCardExpiry: boolean;
  sidebarCollapsed: boolean;
  language: LanguagePreference;
  dateFormat: DateFormat;
  font: AppFont;
  /** Days between automatic backups; 0 turns them off. */
  autoBackupDays: number;
  autoBackupDir: string;
  /** How many automatic backups to keep in the folder. */
  autoBackupKeep: number;
  /** Fetch exchange rates (ECB, via Frankfurter) once a day. */
  autoRates: boolean;
  /** Hide to the tray instead of quitting when the window is closed. */
  closeToTray: boolean;
  /** Global quick-search accelerator; "" turns it off. */
  globalShortcut: string;
  /** Serve the Keyra browser extension on 127.0.0.1. */
  browserIntegration: boolean;
}

/** Result of the last breach check of one login (Have I Been Pwned). */
export interface BreachResult {
  /** When the check ran; results older than the login's passwordUpdatedAt are stale. */
  at: string;
  /** How many times the password appears in known breaches. */
  count: number;
}

export type AppFont = "manrope" | "inter" | "montserrat" | "jakarta" | "dmsans";

export interface VaultData {
  version: 1;
  items: VaultItem[];
  folders: Folder[];
  subscriptions: Subscription[];
  categories: string[];
  settings: Settings;
  /** `${subscriptionId}:${date}` keys a renewal reminder was already sent for. */
  notified: string[];
  /** When the last automatic backup was written (ISO), or "". */
  lastAutoBackup: string;
  /** Breach check results by login id. */
  breaches: Record<string, BreachResult>;
  trash: TrashedItem[];
  /** When exchange rates were last fetched automatically (ISO), or "". */
  ratesUpdatedAt: string;
  /** Created with "Try with a test account": sample data, fixed master password (see lib/demo.ts). */
  test?: boolean;
}

export type Page =
  | "dashboard"
  | "vault"
  | "subscriptions"
  | "calendar"
  | "reports"
  | "wallet"
  | "generator"
  | "security"
  | "settings";
