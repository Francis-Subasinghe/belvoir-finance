/**
 * F4-07 to F4-12 / D-5: strict en-GB input parsing. Nothing is coerced:
 * blank is never £0, "1.000" is never a thousand and an over-cap value is
 * caught on its digit string before any conversion. Pure (F4-01).
 */
export const MONEY_MAX_PENCE = 1_000_000_000; // £10,000,000.00
export const DAYS_MAX = 180;

export type MoneyErrorCode = "blank" | "invalid" | "decimals" | "negative" | "overMax";
export type DaysErrorCode = "blank" | "invalid" | "notWhole" | "daysRange";

export type MoneyResult = { ok: true; pence: number } | { ok: false; code: MoneyErrorCode };
export type DaysResult = { ok: true; days: number } | { ok: false; code: DaysErrorCode };

/**
 * An optional sign (- or U+2212) before or after an optional "£" (spaces
 * allowed after "£"), then digits with no commas or correctly grouped
 * commas, then optionally "." and at least one digit. [0-9] only, so
 * full-width and Arabic-Indic digits never match.
 */
const MONEY =
  /^(?<signA>[-\u2212])?(?:£[ \t\u00a0]*)?(?<signB>[-\u2212])?(?<whole>[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.(?<frac>[0-9]+))?$/;

const DAYS = /^(?<sign>[-\u2212])?(?<whole>[0-9]+)(?:\.(?<frac>[0-9]+))?$/;

/** "007" -> "7", "000" -> "0". */
function stripZeros(digits: string): string {
  const s = digits.replace(/^0+/, "");
  return s === "" ? "0" : s;
}

export function parseMoney(raw: string): MoneyResult {
  const s = String(raw).trim();
  if (s === "") return { ok: false, code: "blank" };
  const m = MONEY.exec(s);
  const g = m?.groups;
  if (!g || (g["signA"] && g["signB"])) return { ok: false, code: "invalid" };
  const whole = g["whole"] ?? "";
  const frac = g["frac"] ?? "";
  if (frac.length > 2) return { ok: false, code: "decimals" };
  if (g["signA"] || g["signB"]) return { ok: false, code: "negative" };
  // The cap is checked on the digit string: no Number() of an unbounded string.
  const pounds = stripZeros(whole.replace(/,/g, ""));
  if (pounds.length > 8) return { ok: false, code: "overMax" };
  const pence = Number(pounds) * 100 + Number(frac.padEnd(2, "0"));
  if (pence > MONEY_MAX_PENCE) return { ok: false, code: "overMax" };
  return { ok: true, pence };
}

export function parseDays(raw: string): DaysResult {
  const s = String(raw).trim();
  if (s === "") return { ok: false, code: "blank" };
  const g = DAYS.exec(s)?.groups;
  if (!g) return { ok: false, code: "invalid" };
  if (g["frac"] !== undefined) return { ok: false, code: "notWhole" };
  if (g["sign"]) return { ok: false, code: "daysRange" };
  const digits = stripZeros(g["whole"] ?? "");
  if (digits.length > 3) return { ok: false, code: "daysRange" };
  const days = Number(digits);
  if (days > DAYS_MAX) return { ok: false, code: "daysRange" };
  return { ok: true, days };
}
