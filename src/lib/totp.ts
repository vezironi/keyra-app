/** RFC 6238 TOTP. Accepts a bare base32 secret or an `otpauth://totp/...` URI. */

export interface TotpConfig {
  secret: Uint8Array;
  digits: number;
  period: number;
  algorithm: "SHA-1" | "SHA-256" | "SHA-512";
}

function base32Decode(input: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = input.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = alphabet.indexOf(ch);
    if (idx === -1) throw new Error("Geçersiz base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function parseTotp(raw: string): TotpConfig | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    if (text.toLowerCase().startsWith("otpauth://")) {
      const url = new URL(text);
      const secret = url.searchParams.get("secret");
      if (!secret) return null;
      const algo = (url.searchParams.get("algorithm") ?? "SHA1").toUpperCase();
      return {
        secret: base32Decode(secret),
        digits: Number(url.searchParams.get("digits") ?? 6),
        period: Number(url.searchParams.get("period") ?? 30),
        algorithm: algo === "SHA256" ? "SHA-256" : algo === "SHA512" ? "SHA-512" : "SHA-1",
      };
    }
    const secret = base32Decode(text);
    if (secret.length === 0) return null;
    return { secret, digits: 6, period: 30, algorithm: "SHA-1" };
  } catch {
    return null;
  }
}

export async function generateTotp(cfg: TotpConfig, now = Date.now()): Promise<string> {
  const counter = Math.floor(now / 1000 / cfg.period);
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const key = await crypto.subtle.importKey(
    "raw",
    cfg.secret as BufferSource,
    { name: "HMAC", hash: cfg.algorithm },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg));
  const offset = mac[mac.length - 1] & 0x0f;
  const code =
    (((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3]) %
    10 ** cfg.digits;
  return code.toString().padStart(cfg.digits, "0");
}
