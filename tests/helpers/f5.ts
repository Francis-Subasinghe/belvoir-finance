/** F5 test helpers: fixtures, the parse wrapper and the source scans (F5-12, F5-18, F5-41). */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseFeed, type ParseResult } from "../../src/lib/intake/parse/parse.ts";

export const FEEDS = "tests/fixtures/f5/feeds";
export const FETCHED_AT = "2026-10-23T08:00:00Z";
export const feed = (name: string): Buffer => readFileSync(join(FEEDS, name));
export function parse(
  bytes: Uint8Array | string,
  opts: { rights?: string; contentType?: string; id?: string } = {},
): ParseResult {
  return parseFeed(typeof bytes === "string" ? feed(bytes) : bytes, {
    source: { id: opts.id ?? "fx-src", rights: opts.rights ?? "titles-only" },
    fetchedAt: FETCHED_AT,
    contentType: opts.contentType,
  });
}
export function okItems(r: ParseResult) {
  if (!r.ok) throw new Error(`expected ok, got ${r.code}`);
  return r.items;
}

export function walkTs(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walkTs(p) : /\.(ts|mjs|js|astro)$/.test(n) ? [p] : [];
  });
}

/** F5-12: what the pure parser folder may never use. */
export const IMPURE_PATTERNS: readonly [string, RegExp][] = [
  ["fetch", /\bfetch\s*\(/],
  ["node:http(s)", /["']node:https?["']/],
  ["node:dns", /["']node:dns(?:\/promises)?["']/],
  ["node:net", /["']node:net["']/],
  ["node:fs", /["'](?:node:)?fs(?:\/promises)?["']/],
  ["process.env", /process\.env/],
  ["Date.now", /Date\.now\s*\(/],
  ["new Date()", /new\s+Date\s*\(\s*\)/],
  ["Math.random", /Math\.random/],
];
export function impurities(text: string): string[] {
  const code = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  return IMPURE_PATTERNS.filter(([, re]) => re.test(code)).map(([n]) => n);
}

/** F5-18: a regex that strips tags, such as /<[^>]*>/ or /<\/?[a-z][^>]*>/gi. */
export const TAG_STRIP_REGEX = /<\\?\/?\??\[\^>\][*+]\??>|<\\?\/?\??\[a-z/i;

/** Relative imports of a module (static `import`/`export ... from` and dynamic `import()`). */
export function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of text.matchAll(
    /(?:import|export)\s[^"';]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)|import\s+["']([^"']+)["']/g,
  )) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec?.startsWith(".")) out.push(spec);
  }
  return out;
}
/** Every repo file reachable from `entries` through relative imports. */
export function importGraph(entries: string[]): Set<string> {
  const seen = new Set<string>();
  const queue = entries.map((e) => resolve(e));
  while (queue.length) {
    const f = queue.pop() as string;
    if (seen.has(f)) continue;
    seen.add(f);
    let deps: string[];
    try {
      deps = importsOf(f);
    } catch {
      continue;
    }
    for (const d of deps) {
      const base = resolve(dirname(f), d);
      for (const cand of [base, `${base}.ts`, `${base}.mjs`, `${base}.js`, join(base, "index.ts")]) {
        try {
          if (statSync(cand).isFile()) {
            queue.push(cand);
            break;
          }
        } catch {
          // try the next candidate
        }
      }
    }
  }
  return seen;
}
