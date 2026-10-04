// Builds the Lighthouse CI URL list and assertMatrix from a built site.
// Shared by lighthouserc.cjs (loaded by lhci), summary.ts and
// tests/unit/lighthouse-config.test.ts. Plain erasable TypeScript, so Node 24
// runs it directly (type stripping), including via require() from the .cjs config.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const ORIGIN = "http://127.0.0.1:4321";
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

/** Attributes of every `<meta ...>` tag, with lower-cased attribute names. */
function metaTags(html: string): Map<string, string>[] {
  return [...html.matchAll(/<meta\b([^>]*)>/gi)].map((m) => {
    const attrs = new Map<string, string>();
    for (const a of (m[1] ?? "").matchAll(ATTR)) {
      attrs.set((a[1] ?? "").toLowerCase(), a[2] ?? a[3] ?? a[4] ?? "");
    }
    return attrs;
  });
}

/**
 * True only for `<meta name="belvoir-demo" content="true">` (attribute order and
 * quoting don't matter; the name compares case-insensitively like any HTML meta
 * name; the content must be exactly "true"). noindex alone never makes a page demo.
 */
export function isDemoHtml(html: string): boolean {
  return metaTags(html).some(
    (a) => a.get("name")?.toLowerCase() === DEMO_META_NAME && a.get("content") === DEMO_META_CONTENT,
  );
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Every built page (each `index.html`; 404.html is skipped), with its demo flag. */
export function listPages(distDir: string): Page[] {
  const pages = walk(distDir)
    .map((f) => ({ file: f, rel: relative(distDir, f).split(sep).join("/") }))
    .filter(({ rel }) => rel === "index.html" || rel.endsWith("/index.html"))
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

/** Assertions for one page. Demo pages skip only the SEO category (their noindex is deliberate, F10). */
export function pageAssertions(budgets: Budgets, page: Page, level: Level): Record<string, Assertion> {
  const out: Record<string, Assertion> = {};
  for (const [id, minScore] of Object.entries(budgets.categories)) {
    if (page.demo && id === "seo") continue;
    out[`categories:${id}`] = [level, { minScore, aggregationMethod }];
  }
  for (const [id, maxNumericValue] of Object.entries(budgets.audits)) {
    out[id] = [level, { maxNumericValue, aggregationMethod }];
  }
  out["resource-summary:script:size"] = [
    level,
    { maxNumericValue: scriptBudget(budgets, new URL(page.url).pathname), aggregationMethod },
  ];
  return out;
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
