/**
 * V1 source and output scans that aren't SVG- or motion-specific:
 * V1-04 (no remote assets), V1-12 / V1-56 (no `?raw` SVG, no set:html),
 * V1-36 (no new @font-face), V1-37 (no rasters), V1-40 (no randomness).
 * Every function is pure over (path, text) so unit fixtures and the real
 * tree run through exactly the same code.
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";

/** Every file under a directory (any extension). */
export function walkAll(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walkAll(p) : [p];
  });
}

export interface SourceProblem {
  file: string;
  rule: "V1-04" | "V1-12" | "V1-36" | "V1-37" | "V1-40" | "V1-56";
  message: string;
}

/* ------------------------------------------------------------------ V1-04 */

/**
 * The F1/F2 stylesheet imports (F2-15 fonts and the local partials). V1-04
 * bans `@import`; these eight pre-date V1, are bundled by Vite (dist has no
 * `@import`, which the build scan checks) and are the only ones allowed.
 */
export const IMPORT_ALLOWLIST: readonly string[] = [
  '"@fontsource/source-serif-4/latin-600.css"',
  '"@fontsource/source-serif-4/latin-700.css"',
  '"@fontsource/inter/latin-400.css"',
  '"@fontsource/inter/latin-600.css"',
  '"@fontsource/ibm-plex-mono/latin-400.css"',
  '"./font-fallbacks.css"',
  '"./tokens.css"',
  '"./components.css"',
];

/** The only absolute URLs allowed in CSS or SVG: the two namespace declarations (A-2). */
const NAMESPACE_DECLS = [
  /\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/g,
  /\bxmlns:xlink="http:\/\/www\.w3\.org\/1999\/xlink"/g,
];

/** Elements whose src/href/srcset/data/poster load a resource (an <a href> is a link, not an asset). */
const LOADING_TAG =
  /<(img|script|link|source|iframe|embed|object|video|audio|track|image|use|input|feimage)\b([^>]*)>/gi;
const LOADING_ATTR = /\b(src|href|xlink:href|srcset|data|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;

const isRemote = (v: string) =>
  /^\s*(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(v) || /^\s*(?:https?|data|javascript):/i.test(v);

/** `url(...)` must be `url(#id)` or a same-origin relative path. */
function urlProblems(file: string, text: string, out: SourceProblem[]) {
  for (const m of text.matchAll(/\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi)) {
    const v = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (v.startsWith("#")) continue;
    if (v === "" || isRemote(v) || /^[a-z][a-z0-9+.-]*:/i.test(v))
      out.push({ file, rule: "V1-04", message: `url(${v}) is not url(#id) or a same-origin path` });
  }
}

const stripCssComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** CSS text (a .css file or an .astro <style> block). `output` = a dist file, where any @import fails. */
export function cssRemoteProblems(file: string, css: string, output = false): SourceProblem[] {
  const out: SourceProblem[] = [];
  const text = stripCssComments(css);
  urlProblems(file, text, out);
  for (const m of text.matchAll(/@import\s+([^;]+);?/gi)) {
    const target = (m[1] ?? "").trim();
    if (output || !IMPORT_ALLOWLIST.includes(target)) out.push({ file, rule: "V1-04", message: `@import ${target}` });
  }
  for (const m of text.matchAll(/(?:https?:)?\/\/[^\s"')]+/gi))
    if (!/^\/\/$/.test(m[0])) out.push({ file, rule: "V1-04", message: `absolute reference ${m[0]} in CSS` });
  return dedupe(out);
}

/** SVG markup: url() rule plus any absolute or protocol-relative reference outside the namespace declarations. */
export function svgRemoteProblems(file: string, svg: string): SourceProblem[] {
  const out: SourceProblem[] = [];
  // Comments are not exempt: a remote reference anywhere in an SVG fails.
  let text = svg;
  for (const ns of NAMESPACE_DECLS) text = text.replace(ns, "");
  urlProblems(file, text, out);
  for (const m of text.matchAll(/(?:https?:)?\/\/[^\s"'<>)]+/gi))
    out.push({ file, rule: "V1-04", message: `absolute reference ${m[0]} in SVG` });
  return dedupe(out);
}

/** HTML or .astro markup: no resource-loading element points at another origin; `<a href>` (ExternalLink) is allowed. */
export function markupRemoteProblems(file: string, html: string): SourceProblem[] {
  const out: SourceProblem[] = [];
  for (const tag of html.matchAll(LOADING_TAG))
    for (const a of (tag[2] ?? "").matchAll(LOADING_ATTR)) {
      const v = a[2] ?? a[3] ?? a[4] ?? "";
      const values = a[1]?.toLowerCase() === "srcset" ? v.split(",").map((s) => s.trim().split(/\s+/)[0] ?? "") : [v];
      for (const one of values)
        if (isRemote(one))
          out.push({ file, rule: "V1-04", message: `<${tag[1]} ${a[1]}="${one}"> loads from another origin` });
    }
  for (const m of html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi))
    out.push(...cssRemoteProblems(file, m[1] ?? ""));
  for (const m of html.matchAll(/\bstyle\s*=\s*"([^"]*)"/gi)) urlProblems(file, m[1] ?? "", out);
  return dedupe(out);
}

/** TypeScript: no remote module specifier and no url() pointing elsewhere. */
export function tsRemoteProblems(file: string, ts: string): SourceProblem[] {
  const out: SourceProblem[] = [];
  for (const m of ts.matchAll(/\b(?:from|import)\s*\(?\s*["']((?:https?:)?\/\/[^"']+)["']/g))
    out.push({ file, rule: "V1-04", message: `remote import ${m[1]}` });
  urlProblems(file, ts.replace(/\/\/.*$/gm, ""), out);
  return dedupe(out);
}

/** Markdoc/Markdown content: no remote image and no raw HTML element that loads something. */
export function contentRemoteProblems(file: string, md: string): SourceProblem[] {
  const out: SourceProblem[] = [];
  for (const m of md.matchAll(/!\[[^\]]*\]\(\s*<?([^)\s>]+)/g))
    if (isRemote(m[1] ?? "")) out.push({ file, rule: "V1-04", message: `remote image ${m[1]}` });
  out.push(...markupRemoteProblems(file, md));
  return dedupe(out);
}

/** Dispatch by extension. */
export function remoteProblems(file: string, text: string, output = false): SourceProblem[] {
  if (/\.css$/i.test(file)) return cssRemoteProblems(file, text, output);
  if (/\.svg$/i.test(file)) return svgRemoteProblems(file, text);
  if (/\.(astro|html?)$/i.test(file)) {
    const out = markupRemoteProblems(file, text);
    if (output) {
      for (const m of text.matchAll(/<svg\b[\s\S]*?<\/svg\s*>/gi)) out.push(...svgRemoteProblems(file, m[0]));
      const scripts = [...text.matchAll(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi)].map(
        (m) => [m.index ?? 0, (m.index ?? 0) + m[0].length] as const,
      );
      for (const m of text.matchAll(/@import\b/gi)) {
        const at = m.index ?? 0;
        if (!scripts.some(([a, b]) => at >= a && at < b))
          out.push({ file, rule: "V1-04", message: "@import in output HTML" });
      }
    }
    return dedupe(out);
  }
  if (/\.(ts|mts|tsx|js|mjs)$/i.test(file)) return tsRemoteProblems(file, text);
  if (/\.(mdoc|md|mdx)$/i.test(file)) return contentRemoteProblems(file, text);
  return [];
}

/* --------------------------------------------------------- V1-12 / V1-56 */

/** Any `?raw` import of an SVG, and any set:html outside JsonLd.astro (F2-34 / F1-31 exception). */
export function svgInjectionProblems(file: string, text: string): SourceProblem[] {
  const out: SourceProblem[] = [];
  if (/\.svg\?raw\b/i.test(text)) out.push({ file, rule: "V1-56", message: "SVG imported with ?raw" });
  const setHtml = text.match(/\bset:html\b/g)?.length ?? 0;
  const isJsonLd = /(^|[\\/])src[\\/]components[\\/]JsonLd\.astro$/.test(file);
  if (setHtml > 0 && !isJsonLd) out.push({ file, rule: "V1-56", message: "set:html is banned (F2-34)" });
  if (isJsonLd && (setHtml !== 1 || !/set:html=\{json\}/.test(text) || !/=\s*serializeJsonLd\(/.test(text)))
    out.push({ file, rule: "V1-56", message: "JsonLd.astro may only set:html its serializeJsonLd output" });
  if (setHtml > 0 && /<svg\b|\.svg\b/i.test(text))
    out.push({ file, rule: "V1-12", message: "SVG-derived markup reaches set:html" });
  return out;
}

/** V1-12: a content value (frontmatter or a Keystatic field) that names an .svg file. */
export function contentSvgValueProblems(file: string, text: string): SourceProblem[] {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? (/\.(ya?ml|json)$/i.test(file) ? text : "");
  return [...fm.matchAll(/["']?([^\s"':,[\]{}]+\.svg)(?:[?#][^\s"']*)?["']?/gi)].map((m) => ({
    file,
    rule: "V1-12" as const,
    message: `content value ${m[1]} is an SVG; SVGs never come from content (rule 7)`,
  }));
}

/* ------------------------------------------------------------------ V1-36 */

/** Atlas-approved faces: the F1 three (F2-15) and the local-only F3 metric fallbacks. */
export const APPROVED_FONT_FACES: readonly string[] = [
  "Source Serif 4/600",
  "Source Serif 4/700",
  "Inter/400",
  "Inter/600",
  "IBM Plex Mono/400",
  "Inter Fallback/400",
  "Inter Fallback/600",
  "Source Serif 4 Fallback/600",
  "Source Serif 4 Fallback/700",
  "IBM Plex Mono Fallback/400",
];

export interface FontFace {
  family: string;
  weight: string;
  src: string;
}

export function fontFaces(css: string): FontFace[] {
  const faces: FontFace[] = [];
  postcss.parse(css).walkAtRules(/^font-face$/i, (at) => {
    const get = (p: string) => {
      let v = "";
      at.walkDecls(new RegExp(`^${p}$`, "i"), (d) => void (v = d.value));
      return v;
    };
    faces.push({
      family: get("font-family")
        .replace(/^["']|["']$/g, "")
        .trim(),
      weight: get("font-weight").trim() || "400",
      src: get("src"),
    });
  });
  return faces;
}

/** `output` = built CSS: real faces load only same-origin /_astro/*.woff2; fallbacks use local() only. */
export function fontFaceProblems(file: string, css: string, output = false): SourceProblem[] {
  const out: SourceProblem[] = [];
  for (const f of fontFaces(css)) {
    const key = `${f.family}/${f.weight}`;
    if (!APPROVED_FONT_FACES.includes(key))
      out.push({ file, rule: "V1-36", message: `@font-face ${key} is not Atlas-approved` });
    const urls = [...f.src.matchAll(/url\(\s*["']?([^)"']+)/g)].map((m) => m[1] ?? "");
    if (/ Fallback$/.test(f.family) && urls.length > 0)
      out.push({ file, rule: "V1-36", message: `${key} must use local() only` });
    if (output && urls.some((u) => !/^\/_astro\/[\w.-]+\.woff2$/.test(u)))
      out.push({ file, rule: "V1-36", message: `${key} loads ${urls.join(", ")}` });
  }
  return out;
}

/* ------------------------------------------------------------------ V1-37 */

export const RASTER_EXT = /\.(png|jpe?g|gif|webp|avif)$/i;

/** Paths under src/, public/, content/ or dist/ (tests and visual baselines aside). */
export function rasterFileProblems(paths: readonly string[]): SourceProblem[] {
  return paths
    .filter((p) => RASTER_EXT.test(p) && /^(src|public|content|dist|dist-gallery)\//.test(p.replace(/\\/g, "/")))
    .map((file) => ({ file, rule: "V1-37" as const, message: "raster image file (Q-5: SVG only)" }));
}

/** No <img> points at a raster. */
export function rasterImgProblems(file: string, html: string): SourceProblem[] {
  const out: SourceProblem[] = [];
  for (const tag of html.matchAll(/<img\b([^>]*)>/gi))
    for (const a of (tag[1] ?? "").matchAll(/\b(src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
      const v = a[2] ?? a[3] ?? a[4] ?? "";
      if (v.split(",").some((s) => RASTER_EXT.test((s.trim().split(/\s+/)[0] ?? "").replace(/[?#].*$/, ""))))
        out.push({ file, rule: "V1-37", message: `<img ${a[1]}="${v}"> is a raster` });
    }
  return out;
}

/* ------------------------------------------------------------------ V1-40 */

const RANDOMNESS: [RegExp, string][] = [
  [/\bMath\s*\.\s*random\b/, "Math.random"],
  [/\bgetRandomValues\b/, "crypto.getRandomValues"],
  [/\brandomUUID\b/, "crypto.randomUUID"],
  [/\bnew\s+Date\s*\(\s*\)/, "new Date() with no argument"],
  [/\bnew\s+Date\b(?!\s*\()/, "new Date with no argument"],
];

export function randomnessProblems(file: string, text: string): SourceProblem[] {
  return RANDOMNESS.filter(([re]) => re.test(text)).map(([, what]) => ({
    file,
    rule: "V1-40" as const,
    message: what,
  }));
}

function dedupe(ps: SourceProblem[]): SourceProblem[] {
  const seen = new Set<string>();
  return ps.filter((p) => {
    const k = `${p.file}|${p.rule}|${p.message}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
}

/**
 * V1-37 (static half; the E2E test measures the real fold at 360 px): a lazy
 * `<img>` inside the hero, or before the end of the first card in <main>.
 */
export function lazyAboveFoldProblems(file: string, html: string): SourceProblem[] {
  const main = html.slice(Math.max(0, html.search(/<main\b/i)));
  const firstCardEnd = main.search(/<\/li\s*>/i);
  const heroEnd = (() => {
    const start = main.search(/class="[^"]*\bhome-hero\b/i);
    if (start < 0) return -1;
    const close = main.indexOf("</section>", start);
    return close < 0 ? main.length : close;
  })();
  const fold = Math.max(firstCardEnd, heroEnd, 0);
  const out: SourceProblem[] = [];
  for (const m of main.matchAll(/<img\b([^>]*)>/gi))
    if ((m.index ?? 0) <= fold && /\bloading\s*=\s*["']?lazy\b/i.test(m[1] ?? ""))
      out.push({ file, rule: "V1-37", message: `lazy <img> above the fold: ${m[0]}` });
  return out;
}
