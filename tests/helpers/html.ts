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

/**
 * True when the opening tag carries exactly one attribute, `type`, whose value
 * is application/ld+json (F3-38; V1 Aegis Low: any other attribute, e.g. `src`
 * or `onload`, makes it a non-JSON-LD script).
 */
export function isJsonLdScriptAttrs(attrs: string): boolean {
  if (!JSONLD_TYPE.test(attrs.trim())) return false;
  const parsed = parseAttributes(attrs);
  if (parsed.length !== 1 || parsed[0]?.[0] !== "type") return false;
  if (parsed[0][1].trim().toLowerCase() !== "application/ld+json") return false;
  // Nothing but that one attribute (and an optional self-closing slash) may be in the tag.
  const rest = attrs.replace(new RegExp(ATTR.source, "i"), "").replace(/\/\s*$/, "");
  return rest.trim() === "";
}

/** F3-38 / F1-15: every <script> opening tag (any case) that isn't a JSON-LD block. */
export function nonJsonLdScriptTags(html: string): string[] {
  return [...html.matchAll(new RegExp("<script\\b([^>]*)>", "gi"))]
    .filter((m) => !isJsonLdScriptAttrs(m[1] ?? ""))
    .map((m) => m[0]);
}

/**
 * The attribute text of every real `<script>` start tag, found by walking the
 * markup the way an HTML tokenizer does: a `<script>` inside a quoted
 * attribute value (for example a chart's aria-label built from an untrusted
 * title) or inside a comment is text, not a tag, and a script's own body is
 * skipped up to its end tag. The regex helpers above can't tell those apart.
 */
export function scriptStartTags(html: string): string[] {
  const out: string[] = [];
  const lower = html.toLowerCase();
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      i = end < 0 ? html.length : end + 3;
      continue;
    }
    const m = /^<\/?([a-zA-Z][\w:-]*)/.exec(html.slice(lt, lt + 64));
    if (!m) {
      i = lt + 1;
      continue;
    }
    // Walk the tag to its closing '>', skipping quoted attribute values.
    let j = lt + m[0].length;
    let quote = "";
    for (; j < html.length; j++) {
      const c = html[j];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'") quote = c;
      else if (c === ">") break;
    }
    const isStart = html[lt + 1] !== "/";
    const name = (m[1] ?? "").toLowerCase();
    if (isStart && name === "script") {
      out.push(html.slice(lt + m[0].length, j).replace(/\/$/, ""));
      const end = lower.indexOf("</script", j);
      i = end < 0 ? html.length : end;
      continue;
    }
    i = j + 1;
  }
  return out;
}
