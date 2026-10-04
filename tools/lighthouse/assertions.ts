// Builds the Lighthouse CI URL list and assertMatrix from a built site.
// Shared by lighthouserc.cjs (loaded by lhci), summary.ts and
// tests/unit/lighthouse-config.test.ts. Plain erasable TypeScript, so Node 24
// runs it directly (type stripping), including via require() from the .cjs config.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Dedicated Lighthouse preview port, so lhci never audits the dev server (4321) or
 * someone else's server. preflight.ts checks it is free before collect starts.
 */
export const HOST = "127.0.0.1";
export const PORT = 4329;
export const ORIGIN = `http://${HOST}:${PORT}`;
export const BASE = "/belvoir-finance/";

/** The demo marker emitted by the layout on `demo: true` pages (F2, Forge). */
export const DEMO_META_NAME = "belvoir-demo";
export const DEMO_META_CONTENT = "true";

export interface Budgets {
  categories: Record<string, number>;
  audits: Record<string, number>;
  scriptTransferBytes: { editorial: number; tools: { path: string; max: number }[] };
}
export interface Page {
  url: string;
  demo: boolean;
}
export type Level = "warn" | "error";
export type Assertion = [Level, Record<string, number | string>];
export interface MatrixEntry {
  matchingUrlPattern: string;
  assertions: Record<string, Assertion>;
}

// TEST_STRATEGY: "median of 3 runs". "median" takes each metric's median across the runs.
const aggregationMethod = "median";

const ATTR = /([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

/** Attributes of every `<meta ...>` tag outside comments, with lower-cased attribute names. */
function metaTags(html: string): Map<string, string>[] {
  const comments = commentRanges(html);
  const outside = (at: number) => !comments.some(([s, e]) => at >= s && at < e);
  return [...html.matchAll(/<meta\b([^>]*)>/gi)]
    .filter((m) => outside(m.index))
    .map((m) => {
      const attrs = new Map<string, string>();
      for (const a of (m[1] ?? "").matchAll(ATTR)) {
        attrs.set((a[1] ?? "").toLowerCase(), a[2] ?? a[3] ?? a[4] ?? "");
      }
      return attrs;
    });
}

/**
 * `[start, end)` ranges of every `<!-- ... -->` comment, scanning forward with
 * indexOf. An unclosed comment runs to the end of the document.
 */
export function commentRanges(html: string): [number, number][] {
  const ranges: [number, number][] = [];
  let i = 0;
  for (;;) {
    const start = html.indexOf("<!--", i);
    if (start === -1) return ranges;
    const close = html.indexOf("-->", start + 4);
    const end = close === -1 ? html.length : close + 3;
    ranges.push([start, end]);
    i = end;
  }
}

/** First match of `re` (global) at or after `from` that does not start inside a comment. */
function firstOutside(html: string, re: RegExp, from: number, comments: [number, number][]): RegExpExecArray | null {
  re.lastIndex = from;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const at = m.index;
    if (!comments.some(([s, e]) => at >= s && at < e)) return m;
  }
  return null;
}

/**
 * The document head: from the first `<head ...>` to the first `</head>` after it
 * (case-insensitive), ignoring any match inside an HTML comment. `<header>` does
 * not count. Undefined if there is no head element or it is not closed, which
 * callers treat as not demo (fail-safe).
 */
export function headOf(html: string): string | undefined {
  const comments = commentRanges(html);
  const open = firstOutside(html, /<head\b[^>]*>/gi, 0, comments);
  if (!open) return undefined;
  const from = open.index + open[0].length;
  const close = firstOutside(html, /<\/head\s*>/gi, from, comments);
  return close ? html.slice(from, close.index) : undefined;
}

/**
 * True only for `<meta name="belvoir-demo" content="true">` inside the document
 * head (attribute order and quoting don't matter; the name compares
 * case-insensitively like any HTML meta name; the content must be exactly "true").
 * Fail-safe: no head, or the marker only in the body, means not demo, so the page
 * keeps its SEO assertion. noindex alone never makes a page demo.
 */
export function isDemoHtml(html: string): boolean {
  const head = headOf(html);
  if (head === undefined) return false;
  return metaTags(head).some(
    (a) => a.get("name")?.toLowerCase() === DEMO_META_NAME && a.get("content") === DEMO_META_CONTENT,
  );
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/**
 * Pages exempt from the SEO category only, as paths relative to BASE. The 404 page
 * carries noindex on purpose (Atlas, PR #14). Every other budget still applies.
 */
export const SEO_EXEMPT_PATHS: readonly string[] = ["/404.html"];

/** Why a page skips the SEO category, or undefined if SEO is asserted. */
export function seoExemption(page: Page): "demo" | "404" | undefined {
  if (page.demo) return "demo";
  const pathname = new URL(page.url).pathname;
  const base = BASE.slice(0, -1);
  return SEO_EXEMPT_PATHS.some((p) => pathname === base + p) ? "404" : undefined;
}

/** Every built page (each `index.html`, plus the root `404.html`), with its demo flag. */
export function listPages(distDir: string): Page[] {
  const pages = walk(distDir)
    .map((f) => ({ file: f, rel: relative(distDir, f).split(sep).join("/") }))
    .filter(({ rel }) => rel === "index.html" || rel.endsWith("/index.html") || rel === "404.html")
    .sort((a, b) => a.rel.localeCompare(b.rel))
    .map(({ file, rel }) => ({
      url: ORIGIN + BASE + rel.replace(/index\.html$/, ""),
      demo: isDemoHtml(readFileSync(file, "utf8")),
    }));
  if (pages.length === 0) throw new Error(`no pages found in ${distDir}/: build it first`);
  return pages;
}

export function readBudgets(path: string): Budgets {
  return JSON.parse(readFileSync(path, "utf8")) as Budgets;
}

/** Script transfer-size budget for a URL path: a tool page's own budget, else editorial. */
export function scriptBudget(budgets: Budgets, pathname: string): number {
  const base = BASE.slice(0, -1);
  return (
    budgets.scriptTransferBytes.tools.find((t) => pathname === base + t.path)?.max ??
    budgets.scriptTransferBytes.editorial
  );
}

/**
 * Assertions for one page. Demo pages (noindex is deliberate, F10) and
 * SEO_EXEMPT_PATHS skip only the SEO category.
 */
export function pageAssertions(budgets: Budgets, page: Page, level: Level): Record<string, Assertion> {
  const out: Record<string, Assertion> = {};
  for (const [id, minScore] of Object.entries(budgets.categories)) {
    if (id === "seo" && seoExemption(page) !== undefined) continue;
    out[`categories:${id}`] = [level, { minScore, aggregationMethod }];
  }
  // TEST_STRATEGY says LCP/CLS/TBT must be strictly "<" the limit, but LHCI's
  // maxNumericValue passes when value <= max. Asserting the largest double below
  // the limit makes "<= max" exactly equal to "< limit".
  for (const [id, limit] of Object.entries(budgets.audits)) {
    out[id] = [level, { maxNumericValue: strictlyBelow(limit), aggregationMethod }];
  }
  out["resource-summary:script:size"] = [
    level,
    { maxNumericValue: scriptBudget(budgets, new URL(page.url).pathname), aggregationMethod },
  ];
  return out;
}

/** The largest float64 strictly below x (for finite x > 0): `v <= strictlyBelow(x)` iff `v < x`. */
export function strictlyBelow(x: number): number {
  if (!Number.isFinite(x) || x <= 0) throw new Error(`strictlyBelow needs a finite positive number, got ${x}`);
  const f = new Float64Array([x]);
  const bits = new BigUint64Array(f.buffer);
  bits[0] = (bits[0] ?? 0n) - 1n;
  return f[0] ?? NaN;
}

export const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Groups pages with identical assertions (demo or not, which JS budget) into one
 * assertMatrix entry whose pattern is an anchored alternation of exactly those URLs,
 * so every URL matches exactly one entry.
 */
export function buildAssertMatrix(budgets: Budgets, pages: Page[], level: Level): MatrixEntry[] {
  const groups = new Map<string, { urls: string[]; assertions: Record<string, Assertion> }>();
  for (const page of pages) {
    const assertions = pageAssertions(budgets, page, level);
    const key = JSON.stringify(assertions);
    const g = groups.get(key) ?? { urls: [], assertions };
    g.urls.push(page.url);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({
    matchingUrlPattern: `^(?:${g.urls.map(escapeRegExp).join("|")})$`,
    assertions: g.assertions,
  }));
}
