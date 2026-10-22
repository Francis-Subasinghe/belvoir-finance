/** F5-20 (D-7, Q-11): feed dates to UTC instants. Strict; never Date.parse. */
import { formatUtc, instantFromParts, parseOffsetDateTime } from "../../sources/rules.ts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** RFC 822 named zones allowed by F5-20, in minutes east of UTC. */
const ZONES: Record<string, number> = {
  UT: 0,
  GMT: 0,
  EST: -300,
  EDT: -240,
  CST: -360,
  CDT: -300,
  MST: -420,
  MDT: -360,
  PST: -480,
  PDT: -420,
};
const RFC822 =
  /^(?:([A-Za-z]{3}),\s*)?(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\s+([A-Za-z]{2,3}|[+-]\d{4})$/;

/** RSS pubDate (RFC 822 / 1123) to a stored UTC string, or null. */
export function parseRssDate(value: string): string | null {
  const m = RFC822.exec(value.trim());
  if (!m) return null;
  const month = MONTHS.findIndex((x) => x.toLowerCase() === m[3]?.toLowerCase());
  if (month < 0) return null;
  const zone = m[8] ?? "";
  let off: number;
  if (/^[+-]\d{4}$/.test(zone)) {
    const hh = Number(zone.slice(1, 3));
    const mm = Number(zone.slice(3, 5));
    if (mm > 59) return null;
    off = (zone.startsWith("-") ? -1 : 1) * (hh * 60 + mm);
  } else {
    const z = ZONES[zone.toUpperCase()];
    if (z === undefined) return null;
    off = z;
  }
  const y = Number(m[4]);
  const d = Number(m[2]);
  const ms = instantFromParts(y, month + 1, d, Number(m[5]), Number(m[6]), Number(m[7] ?? 0), 0, off);
  if (ms === null) return null;
  if (m[1] !== undefined) {
    // The weekday is of the local date written, not the UTC one.
    const local = new Date(Date.UTC(y, month, d)).getUTCDay();
    if (DAYS[local]?.toLowerCase() !== m[1].toLowerCase()) return null;
  }
  return formatUtc(ms, false);
}

/** Atom date (RFC 3339) to a stored UTC string, or null. */
export function parseAtomDate(value: string): string | null {
  const p = parseOffsetDateTime(value.trim());
  return p ? formatUtc(p.ms, p.fraction) : null;
}
