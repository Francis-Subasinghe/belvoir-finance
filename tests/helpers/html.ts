/**
 * Shared HTML matching for tests (CodeQL js/bad-tag-filter). Every tag
 * pattern is case-insensitive and tolerates whitespace and attributes in
 * both the opening and the closing tag (e.g. `<SCRIPT type=x>`, `</script >`).
 * Use these helpers instead of writing ad-hoc tag regexes in test files.
 */
const SCRIPT_BLOCK = /<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi;
const SCRIPT_OPEN = /<script\b/gi;
const SCRIPT_CLOSE = /<\/script\b[^>]*>/gi;

export interface ScriptBlock {
  attrs: string;
  body: string;
}

export function scriptBlocks(html: string): ScriptBlock[] {
  return [...html.matchAll(new RegExp(SCRIPT_BLOCK.source, "gi"))].map((m) => ({
    attrs: m[1] ?? "",
    body: m[2] ?? "",
  }));
}

export function countScriptOpenTags(html: string): number {
  return html.match(new RegExp(SCRIPT_OPEN.source, "gi"))?.length ?? 0;
}

export function countScriptCloseTags(html: string): number {
  return html.match(new RegExp(SCRIPT_CLOSE.source, "gi"))?.length ?? 0;
}

/** Number of opening tags with this name, case-insensitive. */
export function countTags(html: string, name: string): number {
  if (!/^[a-z][a-z0-9-]*$/i.test(name)) throw new Error(`bad tag name: ${name}`);
  return html.match(new RegExp(`<${name}\\b`, "gi"))?.length ?? 0;
}

/** Index of the first opening tag with this name, or -1. */
export function firstTagIndex(html: string, name: string): number {
  if (!/^[a-z][a-z0-9-]*$/i.test(name)) throw new Error(`bad tag name: ${name}`);
  return html.search(new RegExp(`<${name}\\b`, "i"));
}

/** Attribute strings of every opening tag with this name. */
export function tagAttributes(html: string, name: string): string[] {
  if (!/^[a-z][a-z0-9-]*$/i.test(name)) throw new Error(`bad tag name: ${name}`);
  return [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "gi"))].map((m) => m[1] ?? "");
}

const ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
/** Aegis's attribute pattern, applied to a whole attribute string as a cheap first check. */
const JSONLD_TYPE = /(?:^|\s)type\s*=\s*["']?application\/ld\+json["']?(?=\s|\/?$)/i;

/** Attributes of an opening tag as [lower-cased name, value]; quoted values stay inside their attribute. */
export function parseAttributes(attrs: string): [string, string][] {
  return [...attrs.matchAll(new RegExp(ATTR.source, "g"))].map((m) => [
    (m[1] ?? "").toLowerCase(),
    m[2] ?? m[3] ?? m[4] ?? "",
  ]);
}

/** True when the opening tag's own `type` attribute is application/ld+json (not text inside another attribute). */
export function isJsonLdScriptAttrs(attrs: string): boolean {
  if (!JSONLD_TYPE.test(attrs.trim())) return false;
  const types = parseAttributes(attrs).filter(([name]) => name === "type");
  return types.length === 1 && types[0]?.[1].trim().toLowerCase() === "application/ld+json";
}

/** F3-38 / F1-15: every <script> opening tag (any case) that isn't a JSON-LD block. */
export function nonJsonLdScriptTags(html: string): string[] {
  return [...html.matchAll(new RegExp("<script\\b([^>]*)>", "gi"))]
    .filter((m) => !isJsonLdScriptAttrs(m[1] ?? ""))
    .map((m) => m[0]);
}
