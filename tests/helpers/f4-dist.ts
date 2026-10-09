/**
 * F4 checks on built HTML and dist/ file lists. Every function is pure over
 * strings (and file lists), so the real dist/, the gallery build and the
 * negative fixtures in tests/fixtures/f4/html/ go through the same code.
 */
import { gzipSync } from "node:zlib";
import { DISCLAIMER, FIELDS, NOJS_NOTE, TABLE_CAPTION } from "../../src/lib/cash-vs-profit/copy.ts";
import { DEFAULTS } from "../../src/lib/cash-vs-profit/defaults.ts";
import { view } from "../../src/lib/cash-vs-profit/view.ts";
import { nonJsonLdScriptTags, parseAttributes, tagAttributes } from "./html";

export const TOOL_PAGE = "tools/cash-vs-profit/index.html";
export const TOOL_SCRIPT_TAG = /^<script type="module" src="\/belvoir-finance\/_astro\/[\w.-]+\.js"><\/script>$/;
export const TOOL_JS_MAX_GZIP = 122_880;
export const TOOL_JS_TARGET_GZIP = 10_240;
/** F4-49: the shared stylesheet on 5fdc80e (gzip, node zlib default level) and the F4 allowance. */
export const SHARED_CSS_GZIP_5FDC80E = 4_695;
export const SHARED_CSS_ALLOWANCE = 1_024;

const attrsOf = (attrs: string) => new Map(parseAttributes(attrs));
/**
 * Decodes the three entities Astro escapes in text. `&amp;` goes last, so an
 * escaped entity such as `&amp;#39;` decodes once, to the literal `&#39;`
 * (CodeQL js/double-escaping).
 */
export const decodeEntities = (s: string) =>
  s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
/**
 * Text nodes only (the segments between tags) joined as textContent joins them, so an
 * inline element such as the summary's `.money` spans adds no space (F4-15); whitespace
 * collapsed as a browser does.
 */
export const text = (html: string) =>
  decodeEntities([...html.matchAll(/(?:^|>)([^<]*)/g)].map((m) => m[1] ?? "").join(""))
    .replace(/\s+/g, " ")
    .trim();

/** The explorer <section>, from its opening tag to the end of the page's main (enough for every check). */
export function explorerHtml(html: string): string {
  const start = html.search(/<section\b[^>]*data-cvp=/);
  if (start < 0) return "";
  const end = html.indexOf("</main>", start);
  const close = html.indexOf("</section>", html.indexOf('data-testid="explorer-results"', start));
  return html.slice(start, close > 0 ? close : end > 0 ? end : html.length);
}

/* ------------------------------------------------------- F4-30 / F4-46 */

/** Full <script ...></script> elements that aren't JSON-LD. */
function executableScripts(html: string): string[] {
  return [...html.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((s) => nonJsonLdScriptTags(s).length > 0);
}

/** Every .js file a page refers to (script src, modulepreload, preload as=script, any "...js" URL). */
export function jsReferences(html: string): string[] {
  return [...html.matchAll(/(?:src|href)\s*=\s*["']?([^"'\s>]+\.m?js)(?:[?#][^"'\s>]*)?["']?/gi)].map(
    (m) => m[1] ?? "",
  );
}

/**
 * F4-30 / F4-46: the tool page has exactly one executable script, an external
 * module from /belvoir-finance/_astro/; every other page has none, no
 * modulepreload and no .js reference; and every .js in dist/ is loaded by the
 * tool page (no orphans).
 */
export function scriptPolicyProblems(pages: { page: string; html: string }[], jsFiles: readonly string[]): string[] {
  const out: string[] = [];
  let toolRefs: string[] = [];
  for (const { page, html } of pages) {
    const scripts = executableScripts(html);
    const preload = /<link\b[^>]*\brel\s*=\s*["']?modulepreload/i.test(html);
    if (page === TOOL_PAGE) {
      if (scripts.length !== 1 || !TOOL_SCRIPT_TAG.test(scripts[0] ?? "")) {
        out.push(
          `${page}: needs exactly one <script type="module" src="/belvoir-finance/_astro/<hash>.js">, got ${JSON.stringify(scripts)}`,
        );
      }
      if (preload) out.push(`${page}: modulepreload link`);
      toolRefs = jsReferences(html);
      continue;
    }
    if (scripts.length > 0) out.push(`${page}: script ${JSON.stringify(scripts.map((s) => s.slice(0, 80)))}`);
    if (preload) out.push(`${page}: modulepreload link`);
    for (const ref of jsReferences(html)) out.push(`${page}: refers to ${ref}`);
  }
  const loaded = new Set(toolRefs.map((r) => r.replace(/^\/belvoir-finance\//, "")));
  for (const f of jsFiles) if (!loaded.has(f)) out.push(`orphan .js: ${f} is not loaded by ${TOOL_PAGE}`);
  return out;
}

/** F4-45: the gzip size of a set of JS files, given their bytes. */
export function gzipTotal(files: readonly Buffer[]): number {
  return files.reduce((n, b) => n + gzipSync(b).length, 0);
}

/** Static imports in an emitted module ("./x.js", "/belvoir-finance/_astro/x.js"). */
export function moduleImports(js: string): string[] {
  return [...js.matchAll(/\bimport\s*(?:[\w${}\s,*]+from\s*)?["']([^"']+\.js)["']/g)].map((m) => m[1] ?? "");
}

/* ---------------------------------------------------------- explorer markup */

/** F4-06: the pre-rendered worked example equals S3-01 (cells and summary), from the same view(). */
export function workedExampleProblems(html: string): string[] {
  const out: string[] = [];
  const v = view(DEFAULTS);
  if (!v.ok) return ["DEFAULTS don't produce a result"];
  const ex = explorerHtml(html);
  const summary = /<p\b[^>]*data-cvp-status[^>]*>([\s\S]*?)<\/p>/.exec(ex)?.[1];
  if (summary === undefined || text(summary) !== v.summary)
    out.push(`summary is ${JSON.stringify(text(summary ?? ""))}`);
  for (const row of v.rows) {
    for (const c of ["profit", "cashIn", "cashOut", "closing"] as const) {
      const re = new RegExp(`<td\\b[^>]*data-cvp-cell="${row.month}-${c}"[^>]*>([^<]*)</td>`);
      const got = text(re.exec(ex)?.[1] ?? "(missing)");
      if (got !== row[c]) out.push(`month ${row.month} ${c}: ${got}, expected ${row[c]}`);
    }
  }
  if (/\bhidden\b/.test(/<div\b[^>]*data-cvp-table[^>]*>/.exec(ex)?.[0] ?? "hidden"))
    out.push("results table is hidden");
  return out;
}

/** F4-16 / F4-37: labels, hints and input attributes; no form, no input name, buttons type="button". */
export function controlProblems(html: string): string[] {
  const out: string[] = [];
  const ex = explorerHtml(html);
  if (/<form\b/i.test(html)) out.push("a <form> element");
  for (const a of tagAttributes(html, "button")) {
    if (attrsOf(a).get("type") !== "button") out.push(`<button${a}> is not type="button"`);
  }
  const inputs = tagAttributes(ex, "input").map(attrsOf);
  if (inputs.length !== FIELDS.length) out.push(`${inputs.length} inputs, expected ${FIELDS.length}`);
  for (const a of tagAttributes(html, "input").map(attrsOf))
    if (a.has("name")) out.push(`input ${a.get("id")} has a name`);
  for (const f of FIELDS) {
    const a = inputs.find((i) => i.get("id")?.endsWith(`-${f.id}`));
    if (!a) {
      out.push(`no input for ${f.id}`);
      continue;
    }
    const id = a.get("id") ?? "";
    const want: Record<string, string> = {
      type: "text",
      inputmode: f.kind === "money" ? "decimal" : "numeric",
      autocomplete: "off",
      spellcheck: "false",
    };
    for (const [k, w] of Object.entries(want))
      if (a.get(k) !== w) out.push(`${id} ${k}="${a.get(k)}", expected "${w}"`);
    if (a.has("placeholder")) out.push(`${id} has a placeholder`);
    const label = new RegExp(`<label\\b[^>]*for="${id}"[^>]*>([\\s\\S]*?)</label>`).exec(ex)?.[1];
    if (label === undefined || text(label) !== f.label)
      out.push(`${id} label is ${JSON.stringify(label && text(label))}`);
    const hint = new RegExp(`<p\\b[^>]*id="${id}-hint"[^>]*>([\\s\\S]*?)</p>`).exec(ex)?.[1];
    if (hint === undefined || text(hint) !== f.hint) out.push(`${id} hint is ${JSON.stringify(hint && text(hint))}`);
    if (!(a.get("aria-describedby") ?? "").split(" ").includes(`${id}-hint`))
      out.push(`${id} isn't described by its hint`);
  }
  return out;
}

/** F4-18 / F4-21 / F4-35 / F4-41: live region, table semantics, JS-off state and disclaimer in the results. */
export function resultsMarkupProblems(html: string): string[] {
  const out: string[] = [];
  const ex = explorerHtml(html);
  const statuses = [...html.matchAll(/\brole="status"/g)].length;
  if (statuses !== 1) out.push(`${statuses} role="status" elements, expected exactly 1`);
  if (!/<p\b[^>]*role="status"[^>]*data-cvp-status/.test(ex))
    out.push("the results live region isn't in the initial HTML");
  const caption = /<caption\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/caption>/.exec(ex);
  if (!caption || text(caption[2] ?? "") !== TABLE_CAPTION) out.push("missing or wrong caption");
  const region = /<div\b([^>]*role="region"[^>]*)>/.exec(ex)?.[1] ?? "";
  const r = attrsOf(region);
  if (r.get("aria-labelledby") !== caption?.[1] || r.get("tabindex") !== "0")
    out.push("table region isn't labelled by the caption with tabindex=0");
  if ((ex.match(/<th scope="col"/g) ?? []).length !== 5) out.push("expected 5 column headers");
  if ((ex.match(/<th scope="row"/g) ?? []).length !== 6) out.push("expected 6 row headers");
  const results = ex.slice(ex.indexOf('data-testid="explorer-results"'));
  if (!text(results).includes(DISCLAIMER)) out.push("the disclaimer isn't in the results area");
  const fieldset = /<fieldset\b([^>]*)>/.exec(ex)?.[1] ?? "";
  if (!attrsOf(fieldset).has("disabled")) out.push("the fieldset isn't disabled in the HTML");
  const note = /<span\b[^>]*data-cvp-note[^>]*>([\s\S]*?)<\/span>/.exec(ex)?.[1];
  if (note === undefined || text(note) !== NOJS_NOTE) out.push("the JavaScript-off note is missing");
  // F4-36: the note carries its server-rendered text in data-reserve; CSS draws an invisible copy that
  // holds the height when the script swaps the text.
  const noteTag = /<p\b[^>]*class="explorer-note"[^>]*>/.exec(ex)?.[0] ?? "";
  if (attrsOf(noteTag.slice(2, -1)).get("data-reserve") !== NOJS_NOTE) {
    out.push("the note has no reserve copy (data-reserve), so enhancement can shift the layout");
  }
  return out;
}

/** F4-39: each input's value and its assumption default equal DEFAULTS. */
export function defaultsProblems(html: string, assumptions: readonly { label: string; default: string }[]): string[] {
  const out: string[] = [];
  const ex = explorerHtml(html);
  for (const f of FIELDS) {
    const a = tagAttributes(ex, "input")
      .map(attrsOf)
      .find((i) => i.get("id")?.endsWith(`-${f.id}`));
    const value = (a?.get("value") ?? "").replace(/&#163;|&pound;/g, "£");
    if (value !== DEFAULTS[f.id]) out.push(`${f.id} input value ${JSON.stringify(value)} ≠ ${DEFAULTS[f.id]}`);
    const assumption = assumptions.find((x) => x.label === f.label);
    if (!assumption) out.push(`no assumption labelled "${f.label}"`);
    else if (assumption.default !== DEFAULTS[f.id])
      out.push(`assumption "${f.label}" default ${JSON.stringify(assumption.default)} ≠ ${DEFAULTS[f.id]}`);
  }
  return out;
}

/** F4-53: the topic tools card shows the tool icon (decorative) before its link, in a with-icon title. */
export function topicToolIconProblems(html: string): string[] {
  const card = /<article\b[^>]*data-testid="topic-tool"[^>]*>([\s\S]*?)<\/article>/.exec(html)?.[1];
  if (card === undefined) return ["no topic-tool card"];
  const title = /<h3\b([^>]*)>([\s\S]*?)<\/h3>/.exec(card);
  if (!title) return ["no card title"];
  const out: string[] = [];
  if (!/\bwith-icon\b/.test(attrsOf(title[1] ?? "").get("class") ?? "")) out.push("title isn't with-icon");
  const inner = title[2] ?? "";
  const svg = /<svg\b([^>]*)>/.exec(inner);
  const link = inner.search(/<a\b/);
  if (!svg) return [...out, "no icon"];
  const a = attrsOf(svg[1] ?? "");
  if (a.get("aria-hidden") !== "true" || a.get("focusable") !== "false")
    out.push("icon isn't aria-hidden/focusable=false");
  if (a.get("data-icon") !== "cash-vs-profit") out.push(`icon is ${a.get("data-icon")}`);
  if (link < 0 || (svg.index ?? 0) > link) out.push("icon isn't before the link");
  return out;
}
