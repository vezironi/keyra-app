import { tDynamic } from "@/i18n";

export interface GeneratorOptions {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
  avoidAmbiguous: boolean;
}

export const defaultGeneratorOptions: GeneratorOptions = {
  length: 20,
  upper: true,
  lower: true,
  digits: true,
  symbols: true,
  avoidAmbiguous: true,
};

const SETS = {
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lower: "abcdefghijklmnopqrstuvwxyz",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?/~",
};
const AMBIGUOUS = /[O0Il1|`'"]/g;

/** Unbiased random integer in [0, max) using rejection sampling. */
function randomInt(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % max;
}

export function generatePassword(o: GeneratorOptions): string {
  const pools = (["upper", "lower", "digits", "symbols"] as const)
    .filter((k) => o[k])
    .map((k) => (o.avoidAmbiguous ? SETS[k].replace(AMBIGUOUS, "") : SETS[k]));
  if (pools.length === 0) return "";
  const all = pools.join("");
  // Guarantee at least one character from every enabled set, then shuffle.
  const chars = pools.map((p) => p[randomInt(p.length)]);
  while (chars.length < o.length) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.slice(0, o.length).join("");
}

export function generatePin(length: number): string {
  return Array.from({ length }, () => randomInt(10)).join("");
}

export interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  bits: number;
}

const COMMON = [
  "password", "parola", "sifre", "şifre", "123456", "qwerty", "admin", "welcome", "letmein",
  "iloveyou", "monkey", "dragon", "football", "galatasaray", "fenerbahce", "besiktas", "abc123",
];

/** Heuristic estimate: charset entropy with penalties for common words, repeats and sequences. */
export function passwordStrength(pw: string): Strength {
  if (!pw) return { score: 0, bits: 0 };
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33;
  let bits = pw.length * Math.log2(Math.max(pool, 2));

  const lower = pw.toLowerCase();
  if (COMMON.some((w) => lower.includes(w))) bits *= 0.4;
  if (/(.)\1{2,}/.test(pw)) bits *= 0.75;
  if (/(012|123|234|345|456|567|678|789|abc|bcd|cde|qwe|asd|zxc)/i.test(pw)) bits *= 0.8;
  if (/^\d+$/.test(pw)) bits *= 0.7;
  bits = Math.round(bits);

  const score = (bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4) as Strength["score"];
  return { score, bits };
}

export const strengthLabel = (s: Strength) => tDynamic(`strength.${s.score}`);

export const strengthColor = ["bg-red-500", "bg-orange-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-600"];
