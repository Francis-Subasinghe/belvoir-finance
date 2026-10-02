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
