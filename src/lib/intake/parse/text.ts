/**
 * F5-18 (D-4, Q-8, Q-12): feed text becomes plain text. HTML-carrying fields go
 * through parse5's WHATWG tokenizer; only its character tokens are kept (HTML
 * entities decoded once, by the tokenizer) and the result is never parsed
 * again. No tag-stripping regex is used anywhere in the intake folder.
 */
import { Tokenizer } from "parse5";

/** Q-8: invisible and bidi characters removed from item text. Pinned by a test. */
export const INVISIBLE_CHARS: readonly (readonly [number, number])[] = [
  [0x061c, 0x061c],
  [0x180e, 0x180e],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];

export function htmlToText(html: string): string {
  let out = "";
  const keep = (t: { chars: string }) => {
    out += t.chars;
  };
  const ignore = () => undefined;
  const tokenizer = new Tokenizer(
    { sourceCodeLocationInfo: false },
    {
      onCharacter: keep,
      onWhitespaceCharacter: keep,
      onNullCharacter: ignore,
      onComment: ignore,
      onDoctype: ignore,
      onStartTag: ignore,
      onEndTag: ignore,
      onEof: ignore,
    },
  );
  tokenizer.write(html, true);
  return out;
}

const isInvisible = (cp: number) => INVISIBLE_CHARS.some(([a, b]) => cp >= a && cp <= b);
const isControl = (cp: number) => cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f);
const isSpace = (cp: number) => cp === 0x20 || cp === 0x09 || cp === 0x0a || cp === 0x0d || cp === 0x0c || cp === 0xa0;

/** Collapse whitespace, trim, drop controls and invisibles, NFC, then cap (Q-12). */
export function cleanText(text: string, max: number): string {
  let out = "";
  let pendingSpace = false;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (isSpace(cp) || /\s/u.test(ch)) {
      pendingSpace = out.length > 0;
      continue;
    }
    if (isControl(cp) || isInvisible(cp)) continue;
    if (pendingSpace) out += " ";
    pendingSpace = false;
    out += ch;
  }
  return capText(out.normalize("NFC"), max);
}

/** Q-12: at most `max` UTF-16 units, cut on a code-point boundary, ending "…". */
export function capText(text: string, max: number): string {
  if (text.length <= max) return text;
  let out = "";
  for (const ch of text) {
    if (out.length + ch.length > max - 1) break;
    out += ch;
  }
  return `${out.trimEnd()}…`;
}
