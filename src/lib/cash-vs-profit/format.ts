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

/** One piece of a sentence: plain text, or an amount exactly as formatGBP writes it. */
export interface TextSegment {
  text: string;
  money: boolean;
}

/** An amount as formatGBP writes it: optional "-", "£", then grouped whole pounds. */
const AMOUNT = /-?£\d{1,3}(?:,\d{3})*/g;

/**
 * F4-15: splits a sentence into text and amounts, so each amount can be one
 * unbreakable unit (the `.money` class) and "-" never ends a line on its own.
 * The server render and the browser script both use it; joining the pieces'
 * text gives back the sentence unchanged.
 */
export function moneySegments(sentence: string): TextSegment[] {
  const out: TextSegment[] = [];
  let last = 0;
  for (const m of sentence.matchAll(AMOUNT)) {
    if (m.index > last) out.push({ text: sentence.slice(last, m.index), money: false });
    out.push({ text: m[0], money: true });
    last = m.index + m[0].length;
  }
  if (last < sentence.length) out.push({ text: sentence.slice(last), money: false });
  return out;
}
