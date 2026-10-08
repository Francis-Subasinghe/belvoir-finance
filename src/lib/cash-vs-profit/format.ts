/**
 * F4-13 / D-6: the one path from pence to displayed money. Whole pounds,
 * round half away from zero, thousands commas, "-£" for negatives and never
 * "-£0". Integer code only, so the result can't depend on the runtime's
 * locale data. Pure: no DOM, no Date, no randomness (F4-01).
 */
export function formatGBP(pence: number): string {
  if (!Number.isSafeInteger(pence)) throw new RangeError(`formatGBP needs whole pence, got ${String(pence)}`);
  const pounds = Math.floor((Math.abs(pence) + 50) / 100);
  const digits = String(pounds);
  let grouped = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) grouped += ",";
    grouped += digits.charAt(i);
  }
  return `${pence < 0 && pounds > 0 ? "-" : ""}£${grouped}`;
}

/** True when the amount displays as a negative figure (so "-£0" never counts). */
export function displaysNegative(pence: number): boolean {
  return formatGBP(pence).startsWith("-");
}
