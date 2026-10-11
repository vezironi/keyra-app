/**
 * Site matching for the browser extension. Logins match by registrable domain
 * ("accounts.google.com" fills on "mail.google.com"), like Bitwarden's default.
 * Instead of the full Public Suffix List, the multi-label suffixes that matter in
 * practice are listed here.
 */
const MULTI_SUFFIXES = new Set([
  "com.tr", "net.tr", "org.tr", "gov.tr", "edu.tr", "gen.tr", "biz.tr", "info.tr", "web.tr", "av.tr", "bel.tr", "k12.tr", "tsk.tr", "pol.tr",
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "com.au", "net.au", "org.au", "co.nz", "co.jp", "ne.jp", "or.jp", "com.br", "com.cn",
  "com.mx", "co.in", "co.za", "com.ar", "co.kr", "com.sg", "com.hk", "com.tw", "co.id", "com.my", "com.ua", "com.pl", "co.il",
  "github.io", "gitlab.io", "herokuapp.com", "vercel.app", "netlify.app", "pages.dev", "workers.dev", "web.app", "firebaseapp.com",
  "blogspot.com", "azurewebsites.net", "cloudfront.net", "onrender.com", "fly.dev",
]);

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Host (with port for IPs and localhost) of a URL or bare domain, lowercased, without "www.". */
export function siteHost(url: string): string {
  try {
    const u = new URL(url.includes("://") ? url : `https://${url}`);
    if (!/^https?:$/.test(u.protocol)) return "";
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return isLocal(host) && u.port ? `${host}:${u.port}` : host;
  } catch {
    return "";
  }
}

function isLocal(host: string): boolean {
  return IPV4.test(host) || host.startsWith("[") || host === "localhost" || !host.includes(".");
}

export function baseDomain(host: string): string {
  if (!host || isLocal(host.split(":")[0])) return host;
  const parts = host.split(".");
  const n = MULTI_SUFFIXES.has(parts.slice(-2).join(".")) ? 3 : 2;
  return parts.slice(-n).join(".");
}

/** 2: same host, 1: same site (registrable domain), 0: no match. */
export function siteMatch(stored: string, page: string): 0 | 1 | 2 {
  const a = siteHost(stored);
  const b = siteHost(page);
  if (!a || !b) return 0;
  if (a === b) return 2;
  return baseDomain(a) === baseDomain(b) ? 1 : 0;
}
