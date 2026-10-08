/**
 * V1-05 to V1-14, V1-17, V1-38: Aegis's SVG check (AC_V1_VISUAL.md, D-4).
 *
 * One exported function, `checkSvg`, runs every rule over one SVG's markup with
 * a real XML parser (saxes, strict, no regex parsing). The unit tests run it
 * over every committed *.svg and the negative fixtures in tests/fixtures/v1/svg/;
 * the build tests run the same function over every inline <svg> in dist/ and
 * the gallery build (`inlineSvgs`), plus `pageIdCollisions` per page.
 *
 * Rules (Aegis):
 *  1 (V1-05) XML parser; no DOCTYPE/ENTITY, no processing instruction other
 *    than the XML declaration, no CDATA; markup that isn't well-formed fails.
 *  2 (V1-06) element allowlist (ALLOWED_ELEMENTS); everything else fails.
 *  3a (V1-07) no attribute whose name starts with "on", any case.
 *  3b (V1-08) href / xlink:href only on <use>, only "#fragment"; no style attribute.
 *  4 (V1-09) url() only as url(#id); no javascript:, data:, http:, https: or //
 *    in any value, except exactly xmlns="http://www.w3.org/2000/svg" and
 *    xmlns:xlink="http://www.w3.org/1999/xlink"; any other xmlns:* fails.
 *  5 (V1-10) every id starts with the asset's prefix; ids are unique per page.
 *  6 (V1-11) per-file byte cap by kind.
 *  7 (V1-12) location: src/assets/ only, plus public/favicon.svg (`svgLocationProblems`).
 * Asset rules for committed files (`asset` option):
 *  V1-14 colour: inline assets use only currentColor/none/transparent (or a
 *    class); a served file's literals must equal an F2 token value.
 *  V1-17 decorative assets carry no <text>/<tspan>.
 *  V1-38 optimised: no comments, editor metadata or namespaces, no empty
 *    groups, at most 2 decimals per number.
 */
import { SaxesParser } from "saxes";

export type SvgRule =
  "V1-03" | "V1-05" | "V1-06" | "V1-07" | "V1-08" | "V1-09" | "V1-10" | "V1-11" | "V1-12" | "V1-14" | "V1-17" | "V1-38";

export interface SvgProblem {
  file: string;
  rule: SvgRule;
  message: string;
}

export const ALLOWED_ELEMENTS: readonly string[] = [
  "svg",
  "g",
  "defs",
  "title",
  "desc",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "pattern",
  "symbol",
  "use",
  "text",
  "tspan",
];
const ALLOWED_LOWER = new Set(ALLOWED_ELEMENTS.map((e) => e.toLowerCase()));

/** Only these two namespace declarations are exempt from rule 4 (A-2), by exact name and value. */
export const EXEMPT_NAMESPACES: Readonly<Record<string, string>> = {
  xmlns: "http://www.w3.org/2000/svg",
  "xmlns:xlink": "http://www.w3.org/1999/xlink",
};

/** Q-3 byte caps (raw bytes). */
export const SVG_BYTE_CAPS = { icon: 2048, cover: 4096, illustration: 8192, hero: 12288, diagram: 8192 } as const;
export type SvgKind = keyof typeof SVG_BYTE_CAPS;

export interface SvgCheckOptions {
  /** Shown in every message. */
  file: string;
  /** Rule 5: every id must start with this (for example "hero-"). */
  idPrefix?: string | undefined;
  /** Rule 6: the byte cap for this kind of asset. */
  kind?: SvgKind | undefined;
  /**
   * Committed-file rules (V1-14 colour, V1-17 text, V1-38 optimisation).
   * "inline": imported as a component, so colour comes from currentColor or classes.
   * "served": served as a file (favicon), so literal colours must be token values.
   */
  asset?: "inline" | "served" | undefined;
  /** V1-17: decorative assets may not contain <text>/<tspan>. */
  decorative?: boolean | undefined;
  /** For V1-14 "served" files: the allowed literal colours (lower-case hex). */
  tokenColours?: ReadonlySet<string> | undefined;
}

const BAD_VALUE = /javascript:|data:|https?:|\/\//i;
const URL_REF = /url\s*\(/gi;
const URL_FRAGMENT = /^url\(\s*#[A-Za-z][\w.-]*\s*\)/i;
const COLOUR_ATTRS = new Set(["fill", "stroke", "stop-color", "color", "flood-color", "lighting-color"]);
const INLINE_COLOUR_OK = new Set(["currentcolor", "none", "transparent", "inherit"]);
const EDITOR_PREFIXES = /^(sodipodi|inkscape|sketch|serif|figma|adobe|i|x|illustrator|dc|cc|rdf):/i;
const THIRD_PARTY =
  /\b(inkscape|sodipodi|illustrator|adobe|figma|sketch|canva|freepik|shutterstock|getty|flaticon|font ?awesome|midjourney|dall-?e|stable ?diffusion)\b/i;

/** Every rule over one SVG document (a file, or one inline <svg> fragment from HTML). */
export function checkSvg(markup: string, opts: SvgCheckOptions): SvgProblem[] {
  const problems: SvgProblem[] = [];
  const add = (rule: SvgRule, message: string) => problems.push({ file: opts.file, rule, message });

  // Rule 6: byte cap.
  if (opts.kind) {
    const bytes = Buffer.byteLength(markup, "utf8");
    const cap = SVG_BYTE_CAPS[opts.kind];
    if (bytes > cap) add("V1-11", `${bytes} bytes is over the ${opts.kind} cap of ${cap} bytes`);
  }

  const parser = new SaxesParser({ xmlns: false, position: true });
  const stack: { name: string; children: number }[] = [];
  let sawRoot = false;
  const xlink = { declared: false, used: false };
  parser.on("doctype", () => add("V1-05", "DOCTYPE (and any ENTITY it declares) is not allowed"));
  parser.on("processinginstruction", (pi) => add("V1-05", `processing instruction <?${pi.target}?> is not allowed`));
  parser.on("cdata", () => add("V1-05", "CDATA sections are not allowed"));
  parser.on("comment", () => {
    if (opts.asset) add("V1-38", "comments are not allowed in a committed SVG");
  });
  parser.on("text", (t) => {
    if (opts.asset && THIRD_PARTY.test(t))
      add("V1-03", `text names a third-party tool or source: "${t.trim().slice(0, 40)}"`);
  });
  parser.on("opentag", (tag) => {
    const name = tag.name;
    const lower = name.toLowerCase();
    if (stack.length === 0) {
      if (sawRoot) add("V1-05", "more than one root element");
      sawRoot = true;
      if (lower !== "svg") add("V1-06", `the root element is <${name}>, not <svg>`);
    }
    const parent = stack[stack.length - 1];
    if (parent) parent.children++;
    stack.push({ name, children: 0 });
    if (!ALLOWED_LOWER.has(lower)) add("V1-06", `<${name}> is not an allowed SVG element`);
    if (opts.asset && (lower === "metadata" || EDITOR_PREFIXES.test(name)))
      add("V1-38", `<${name}> is editor metadata`);
    if (opts.decorative && (lower === "text" || lower === "tspan"))
      add("V1-17", `<${name}> in a decorative asset: text is never baked into art`);
    for (const [attrName, raw] of Object.entries(tag.attributes as Record<string, string>)) {
      if (attrName === "xmlns:xlink") xlink.declared = true;
      if (attrName.startsWith("xlink:")) xlink.used = true;
      if (opts.asset && THIRD_PARTY.test(String(raw))) add("V1-03", `${attrName} names a third-party tool or source`);
      checkAttribute(name, attrName, String(raw), opts, add);
    }
  });
  parser.on("closetag", (tag) => {
    const top = stack.pop();
    if (opts.asset && top && tag.name.toLowerCase() === "g" && top.children === 0) add("V1-38", "empty <g> group");
  });
  parser.on("error", (e) => {
    add("V1-05", `not well-formed XML: ${e.message.split("\n")[0]}`);
  });
  try {
    parser.write(markup).close();
  } catch {
    // saxes reports through "error" first; a throw after that just stops parsing.
  }
  if (!sawRoot) add("V1-05", "no <svg> root element");
  if (opts.asset && xlink.declared && !xlink.used)
    add("V1-38", "xmlns:xlink is declared but nothing uses xlink: (unused namespace)");
  return dedupe(problems);
}

function checkAttribute(
  element: string,
  name: string,
  value: string,
  opts: SvgCheckOptions,
  add: (rule: SvgRule, message: string) => void,
): void {
  const el = element.toLowerCase();
  const n = name.toLowerCase();
  // Rule 3a
  if (n.startsWith("on")) add("V1-07", `<${element} ${name}>: event-handler attributes are not allowed`);
  // Rule 3b
  if (n === "style") add("V1-08", `<${element} style>: style attributes are not allowed`);
  if (n === "href" || n === "xlink:href") {
    if (el !== "use") add("V1-08", `<${element} ${name}>: href is allowed only on <use>`);
    else if (!/^#[A-Za-z][\w.-]*$/.test(value.trim()))
      add("V1-08", `<use ${name}="${value}">: only a same-document #fragment is allowed`);
  }
  // Rule 4: namespaces
  if (n === "xmlns" || n.startsWith("xmlns:")) {
    const exempt = EXEMPT_NAMESPACES[name];
    if (exempt === undefined) add("V1-09", `${name}: only xmlns and xmlns:xlink may be declared`);
    else if (value !== exempt) add("V1-09", `${name}="${value}": must be exactly "${exempt}"`);
    return;
  }
  if (opts.asset && EDITOR_PREFIXES.test(name)) add("V1-38", `${name}: editor metadata attribute`);
  if (opts.asset && n === "data-name") add("V1-38", "data-name: editor export attribute");
  // Rule 4: values
  for (const m of value.matchAll(URL_REF)) {
    if (!URL_FRAGMENT.test(value.slice(m.index))) add("V1-09", `${name}="${value}": url() must be url(#id)`);
  }
  if (BAD_VALUE.test(value)) add("V1-09", `${name}="${value}": javascript:, data:, http(s): and // are not allowed`);
  // Rule 5
  if (n === "id" && opts.idPrefix !== undefined && !value.startsWith(opts.idPrefix))
    add("V1-10", `id="${value}" must start with "${opts.idPrefix}"`);
  // V1-14
  if (opts.asset && COLOUR_ATTRS.has(n)) {
    const v = value.trim().toLowerCase();
    if (!URL_FRAGMENT.test(v) && !INLINE_COLOUR_OK.has(v)) {
      if (opts.asset === "inline")
        add("V1-14", `${name}="${value}": inline assets take colour from currentColor or a token class, not a literal`);
      else if (!(opts.tokenColours ?? new Set()).has(normaliseHex(v)))
        add("V1-14", `${name}="${value}": a served SVG's literal colour must be an F2 token value`);
    }
  }
  // V1-38: number precision
  if (opts.asset && /\d\.\d{3,}/.test(value)) add("V1-38", `${name}: numbers have more than 2 decimals`);
}

function normaliseHex(v: string): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (!m?.[1]) return v;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return `#${h.toLowerCase()}`;
}

function dedupe(ps: SvgProblem[]): SvgProblem[] {
  const seen = new Set<string>();
  return ps.filter((p) => {
    const k = `${p.rule}|${p.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Every inline <svg>…</svg> in an HTML page (svg can't nest in our markup; a nested one fails rule 1 parsing). */
export function inlineSvgs(html: string): string[] {
  return [...html.matchAll(/<svg\b[\s\S]*?<\/svg\s*>/gi)].map((m) => m[0]);
}

/** Rule 5 per page: ids defined by more than one inline SVG (or twice in one). */
export function pageIdCollisions(html: string): string[] {
  const count = new Map<string, number>();
  for (const svg of inlineSvgs(html)) {
    for (const m of svg.matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)) {
      const id = m[1] ?? "";
      count.set(id, (count.get(id) ?? 0) + 1);
    }
  }
  return [...count].filter(([, n]) => n > 1).map(([id]) => id);
}

/** Rule 7: committed SVGs live only in src/assets/, plus the named favicon exception (A-3). */
export function svgLocationProblems(paths: readonly string[]): SvgProblem[] {
  return paths
    .filter((p) => p.toLowerCase().endsWith(".svg"))
    .filter((p) => !p.startsWith("src/assets/") && p !== "public/favicon.svg")
    .map((p) => ({
      file: p,
      rule: "V1-12" as const,
      message: "SVGs may only live in src/assets/ (or be public/favicon.svg)",
    }));
}
