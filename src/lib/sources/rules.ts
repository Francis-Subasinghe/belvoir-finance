/**
 * F5 pure rules shared by the content schemas (src/content/schemas.ts), the
 * intake parser (src/lib/intake/parse/) and the artifact import. No I/O, no
 * clock. Kept out of src/lib/intake/ so `astro build` never imports intake
 * code (F5-41). Imports carry .ts extensions so Node runs them directly.
 */

/** F5-06 / F5-20 (CF-07, D-7): RFC 3339 date-time with an offset (`Z` or ±hh:mm, at most ±14:00). */
const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-](\d{2}):(\d{2}))$/;

export function daysInMonth(y: number, m: number): number {
  return [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    m - 1
  ] as number;
}

/** Returns the UTC epoch milliseconds for a real instant, or null. Validates every field (no rollover). */
export function instantFromParts(
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  s: number,
  ms: number,
  offsetMinutes: number,
): number | null {
  if (y < 1000 || y > 9999 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  if (h > 23 || mi > 59 || s > 59) return null;
  if (Math.abs(offsetMinutes) > 14 * 60) return null;
  return Date.UTC(y, mo - 1, d, h, mi, s, ms) - offsetMinutes * 60_000;
}

/** Parse an RFC 3339 offset date-time. `fraction` is true when the input carried fractional seconds. */
export function parseOffsetDateTime(value: unknown): { ms: number; fraction: boolean } | null {
  if (typeof value !== "string") return null;
  const m = RFC3339.exec(value);
  if (!m) return null;
  const frac = m[7] ? Number(`0${m[7]}`.slice(0, 5).padEnd(5, "0")) : 0;
  let off = 0;
  if (m[8] !== "Z") {
    const oh = Number(m[9]);
    const om = Number(m[10]);
    if (om > 59) return null;
    off = (m[8]?.startsWith("-") ? -1 : 1) * (oh * 60 + om);
  }
  const ms = instantFromParts(
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6]),
    Math.floor(frac * 1000),
    off,
  );
  return ms === null ? null : { ms, fraction: Boolean(m[7]) };
}

/** Q-11: instants are stored in UTC with `Z`, with milliseconds only when the feed gave them. */
export function formatUtc(ms: number, fraction: boolean): string {
  const iso = new Date(ms).toISOString();
  return fraction ? iso : `${iso.slice(0, 19)}Z`;
}

/**
 * F5-49 / F5-26 / F5-27 (Q-6, Q-8): an https URL whose host is a DNS name (no IP
 * literal in any form, since the WHATWG parser turns decimal, octal and hex
 * forms into dotted IPv4), with no userinfo and port 443 only.
 */
export type UrlShapeProblem = "not-https" | "bad-host" | "invalid";
export function isIpLiteralHost(hostname: string): boolean {
  return hostname.startsWith("[") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}
export function urlShapeProblem(value: string): UrlShapeProblem | null {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return "invalid";
  }
  if (u.protocol !== "https:") return "not-https";
  if (u.username || u.password || u.port !== "" || !u.hostname || isIpLiteralHost(u.hostname)) return "bad-host";
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9-]*[a-z][a-z0-9-]*\.?$/.test(u.hostname)) return "bad-host";
  return null;
}

/** F5-19 / F5-10 (Q-20): item links. */
export const MAX_ITEM_URL_LENGTH = 2048;
export function itemUrlOk(value: string): boolean {
  if (value.length > MAX_ITEM_URL_LENGTH) return false;
  // Only an absolute https: URL as written; WHATWG would strip tabs and newlines, so refuse them first.
  if (hasCodeUnitIn(value, (c) => c <= 0x20 || c === 0x7f)) return false;
  if (!/^https:\/\/[^/]/i.test(value)) return false;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  return u.protocol === "https:" && Boolean(u.hostname) && !u.username && !u.password;
}

/** Q-11: lower-case scheme and host, drop the default port and the fragment; keep path and query. */
export function normaliseUrl(value: string): string {
  const u = new URL(value);
  u.hash = "";
  return u.href;
}

/** F5-07 / D-5 (E table): the closed list of lastError codes. */
export const LAST_ERROR_CODES = [
  "not-in-registry",
  "not-https",
  "dns-failure",
  "blocked-address",
  "redirect-blocked",
  "too-many-redirects",
  "tls-error",
  "timeout",
  "http",
  "too-large",
  "dtd-forbidden",
  "malformed-xml",
  "bad-encoding",
  "unsupported-format",
  "too-many-items",
  "too-deep",
  "bad-content-encoding",
  "bad-host",
] as const;
export type LastErrorCode = Exclude<(typeof LAST_ERROR_CODES)[number], "http"> | `http-${number}`;
/** One code from the E table; `http-<3-digit status>` for E-09. Anchored at both ends (M-27). */
export const LAST_ERROR_PATTERN = new RegExp(
  `^(?:${LAST_ERROR_CODES.filter((c) => c !== "http").join("|")}|http-[1-5]\\d\\d)$`,
);
export const LAST_ERROR_MAX = 32;
export function isLastError(v: unknown): v is LastErrorCode {
  return typeof v === "string" && v.length <= LAST_ERROR_MAX && LAST_ERROR_PATTERN.test(v);
}

/** C0 (U+0000 to U+001F), DEL and C1 (U+0080 to U+009F). */
export const isControl = (c: number): boolean => c <= 0x1f || (c >= 0x7f && c <= 0x9f);
export function hasCodeUnitIn(v: string, pred: (c: number) => boolean): boolean {
  for (let i = 0; i < v.length; i++) if (pred(v.charCodeAt(i))) return true;
  return false;
}

/** F5-10: no C0 or C1 control character (tabs and newlines included) and NFC. */
export function itemTextProblem(v: string): string | null {
  if (hasCodeUnitIn(v, isControl)) return "contains a control character";
  if (v.normalize("NFC") !== v) return "is not NFC";
  return null;
}
