/**
 * The ONLY way JSON-LD reaches a page (F1-31). JSON.stringify output is made
 * safe for an inline <script type="application/ld+json"> by escaping the
 * characters that could close the element or start markup.
 */
const ESCAPES: Record<string, string> = {
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

export function serializeJsonLd(data: unknown): string {
  const json = JSON.stringify(data);
  if (json === undefined) throw new TypeError("JSON-LD data is not serialisable");
  return json.replace(/[<>&\u2028\u2029]/g, (ch) => ESCAPES[ch] ?? ch);
}
