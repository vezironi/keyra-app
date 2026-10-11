import type { CardItem, CustomField, IdentityItem, LoginItem, NoteItem, VaultData, VaultItem } from "./types";
import { newItem } from "./defaults";
import { uid } from "./format";

/**
 * Reads exports from other password managers: Bitwarden (unencrypted JSON or CSV),
 * Chrome / Edge / Brave, Firefox, 1Password, KeePass / KeePassXC, LastPass, Dashlane
 * and any CSV whose headers name the usual columns (name, url, username, password…).
 */

export type ImportSource = "bitwarden" | "chrome" | "firefox" | "onepassword" | "keepass" | "lastpass" | "dashlane" | "csv";

export interface ParsedImport {
  source: ImportSource;
  /** Each item with the folder name it had in the other app ("" for none). */
  entries: { item: VaultItem; folder: string }[];
}

/** Thrown as a stable error code so the UI can translate it. */
const fail = (code: string): never => {
  throw code;
};

export function parseExport(text: string): ParsedImport {
  const trimmed = text.trim();
  if (!trimmed) fail("import_empty");
  if (trimmed.startsWith("{")) return parseBitwardenJson(trimmed);
  return parseCsv(trimmed);
}

/** Adds the parsed items to the vault, creating folders and skipping exact duplicates. */
export function mergeImport(data: VaultData, parsed: ParsedImport): { data: VaultData; added: number; duplicates: number } {
  const folders = [...data.folders];
  const folderId = (name: string) => {
    if (!name) return null;
    const found = folders.find((f) => f.name.toLowerCase() === name.toLowerCase());
    if (found) return found.id;
    const created = { id: uid(), name };
    folders.push(created);
    return created.id;
  };

  const seen = new Set(data.items.map(fingerprint));
  const items: VaultItem[] = [];
  let duplicates = 0;
  for (const { item, folder } of parsed.entries) {
    const key = fingerprint(item);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    items.push({ ...item, folderId: folderId(folder) });
  }
  // Only keep folders that actually received items.
  const used = new Set(items.map((i) => i.folderId));
  const newFolders = folders.filter((f) => data.folders.includes(f) || used.has(f.id));
  return { data: { ...data, folders: newFolders, items: [...data.items, ...items] }, added: items.length, duplicates };
}

function fingerprint(item: VaultItem): string {
  switch (item.type) {
    case "login":
      return ["login", item.name.toLowerCase(), item.username, item.password, hostOf(item.urls[0] ?? "")].join("\u0000");
    case "card":
      return ["card", item.number.replace(/\s/g, "")].join("\u0000");
    default:
      return [item.type, item.name.toLowerCase(), item.notes].join("\u0000");
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

function login(name: string, url: string, username: string, password: string, totp: string, notes: string): LoginItem {
  const item = newItem("login") as LoginItem;
  const urls = url
    .split(/[\n,]\s*/)
    .map((u) => u.trim())
    .filter(Boolean);
  return {
    ...item,
    name: name.trim() || hostOf(urls[0] ?? "") || username || "—",
    urls: urls.length ? urls : [""],
    username,
    password,
    totp: totp.trim(),
    notes,
  };
}

function note(name: string, notes: string): NoteItem {
  return { ...(newItem("note") as NoteItem), name: name.trim() || "—", notes };
}

// ---------------------------------------------------------------- Bitwarden JSON

interface BwField {
  name?: string;
  value?: string;
  type?: number;
}

interface BwItem {
  type: number;
  name?: string;
  notes?: string;
  favorite?: boolean;
  folderId?: string | null;
  fields?: BwField[];
  login?: { username?: string; password?: string; totp?: string; uris?: { uri?: string }[] };
  card?: { cardholderName?: string; brand?: string; number?: string; expMonth?: string; expYear?: string; code?: string };
  identity?: Record<string, string | null>;
}

function parseBitwardenJson(text: string): ParsedImport {
  let json: { encrypted?: boolean; folders?: { id: string; name: string }[]; items?: BwItem[] };
  try {
    json = JSON.parse(text);
  } catch {
    return fail("import_unrecognized");
  }
  if (json.encrypted) fail("import_encrypted");
  if (!Array.isArray(json.items)) fail("import_unrecognized");

  const folderNames = new Map((json.folders ?? []).map((f) => [f.id, f.name]));
  const entries: ParsedImport["entries"] = [];
  for (const x of json.items!) {
    const item = bitwardenItem(x);
    if (!item) continue;
    item.favorite = !!x.favorite;
    item.fields = (x.fields ?? []).filter((f) => f.name || f.value).map((f) => field(str(f.name), str(f.value), f.type === 1));
    entries.push({ item, folder: (x.folderId && folderNames.get(x.folderId)) || "" });
  }
  return { source: "bitwarden", entries };
}

function bitwardenItem(x: BwItem): VaultItem | null {
  const name = str(x.name);
  const notes = str(x.notes);
  switch (x.type) {
    case 1: {
      const l = x.login ?? {};
      const urls = (l.uris ?? []).map((u) => str(u.uri)).filter(Boolean);
      return login(name, urls.join("\n"), str(l.username), str(l.password), str(l.totp), notes);
    }
    case 2:
      return note(name, notes);
    case 3: {
      const c = x.card ?? {};
      return {
        ...(newItem("card") as CardItem),
        name: name || "—",
        notes,
        cardholder: str(c.cardholderName),
        brand: str(c.brand),
        number: str(c.number),
        expMonth: str(c.expMonth).padStart(2, "0").slice(-2),
        expYear: str(c.expYear),
        cvv: str(c.code),
      };
    }
    case 4: {
      const i = x.identity ?? {};
      const g = (k: string) => str(i[k]);
      return {
        ...(newItem("identity") as IdentityItem),
        name: name || "—",
        notes,
        firstName: [g("firstName"), g("middleName")].filter(Boolean).join(" "),
        lastName: g("lastName"),
        email: g("email"),
        phone: g("phone"),
        nationalId: g("ssn"),
        company: g("company"),
        address: [g("address1"), g("address2"), g("address3")].filter(Boolean).join(", "),
        city: g("city"),
        postalCode: g("postalCode"),
        country: g("country"),
      };
    }
    default:
      return null;
  }
}

function field(label: string, value: string, hidden: boolean): CustomField {
  return { id: uid(), label, value, hidden };
}

// ---------------------------------------------------------------- CSV

/** Header names (lowercase) that other apps use for each column. */
const COLUMNS = {
  name: ["name", "title", "account", "item name"],
  url: ["url", "login_uri", "uri", "website", "web site", "login url", "urls"],
  username: ["username", "login_username", "login", "user name", "user", "login name", "username1", "email"],
  password: ["password", "login_password"],
  totp: ["totp", "login_totp", "otpauth", "otp", "otpsecret", "otp secret", "one-time password"],
  notes: ["notes", "note", "extra", "comments", "comment"],
  folder: ["folder", "grouping", "group", "category"],
  favorite: ["favorite", "fav", "favourite"],
  type: ["type"],
  fields: ["fields"],
};

type Column = keyof typeof COLUMNS;

function detectSource(headers: string[]): ImportSource {
  const has = (h: string) => headers.includes(h);
  if (has("login_uri")) return "bitwarden";
  if (has("httprealm")) return "firefox";
  if (has("grouping") && has("extra")) return "lastpass";
  if (has("username2") || has("otpsecret")) return "dashlane";
  if (has("group") && has("title")) return "keepass";
  if (has("otpauth") || (has("title") && has("url"))) return "onepassword";
  if (has("name") && has("url") && has("username") && has("password")) return "chrome";
  return "csv";
}

function parseCsv(text: string): ParsedImport {
  const firstLine = text.slice(0, text.indexOf("\n") >>> 0);
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows = csvRows(text, delimiter).filter((r) => r.some((c) => c.trim()));
  if (rows.length < 1) fail("import_empty");

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const index = {} as Record<Column, number>;
  for (const col of Object.keys(COLUMNS) as Column[]) index[col] = headers.findIndex((h) => COLUMNS[col].includes(h));
  if (index.password < 0 && index.notes < 0) fail("import_unrecognized");

  const source = detectSource(headers);
  const entries: ParsedImport["entries"] = [];
  for (const row of rows.slice(1)) {
    const get = (col: Column) => (index[col] >= 0 ? (row[index[col]] ?? "") : "");
    const name = get("name");
    const url = get("url");
    const kind = get("type").toLowerCase();
    // LastPass marks secure notes with the pseudo URL "http://sn".
    const isNote = kind === "note" || kind === "securenote" || url === "http://sn";
    if (!isNote && !get("password") && !get("username") && !url) {
      if (!name && !get("notes")) continue;
    }
    const item = isNote ? note(name, get("notes")) : login(name, url, get("username"), get("password"), get("totp"), get("notes"));
    item.favorite = ["1", "true", "yes"].includes(get("favorite").toLowerCase());
    item.fields = parseFieldColumn(get("fields"));
    entries.push({ item, folder: cleanFolder(get("folder")) });
  }
  if (!entries.length) fail("import_empty");
  return { source, entries };
}

/** Bitwarden CSV packs custom fields as "name: value" lines. */
function parseFieldColumn(raw: string): CustomField[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.match(/^([^:]+):\s?(.*)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => field(m[1].trim(), m[2], false));
}

/** KeePass exports "Root/Email/Work"; drop the root and keep the rest. */
function cleanFolder(raw: string): string {
  const parts = raw.split(/[/\\]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1 && /^(root|database|keepass)$/i.test(parts[0])) parts.shift();
  return parts.join("/");
}

/** RFC 4180 CSV: quoted fields may contain delimiters, quotes ("") and newlines. */
function csvRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}
