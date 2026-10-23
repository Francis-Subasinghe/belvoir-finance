/**
 * V2 assertions on the built site (dist/), run by postbuild: the same check
 * functions the unit test runs over src/ and the negative fixtures
 * (tests/helpers/v2-scan.ts).
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { requireBuild } from "../helpers/built-site";
import { SITE_CSP } from "../helpers/csp";
import { tokenMap } from "../helpers/motion-scan";
import { inlineSvgs } from "../helpers/svg-check";
import {
  builtFontProblems,
  cssMotionProblems,
  cssOriginProblems,
  embedProblems,
  fallbackProblems,
  fontFaceProblems,
  fontLoaderProblems,
  type FontManifestEntry,
  htmlInlineProblems,
  htmlOriginProblems,
  navOpacityProblems,
  outlineRemovalProblems,
  preloadProblems,
  referenceProblems,
  svgV2Problems,
  trustedTypesProblems,
} from "../helpers/v2-scan";

const DIST = "dist";
let files: string[] = [];
let pages: { rel: string; html: string }[] = [];
let css: { rel: string; text: string }[] = [];
let js: { rel: string; text: string }[] = [];
const rel = (f: string) => relative(DIST, f).replace(/\\/g, "/");
const manifest = JSON.parse(readFileSync("src/fonts/font-hashes.json", "utf8")) as FontManifestEntry[];
const tokens = tokenMap(readFileSync("src/styles/tokens.css", "utf8"));

beforeAll(() => {
  files = requireBuild(DIST);
  pages = files.filter((f) => f.endsWith(".html")).map((f) => ({ rel: rel(f), html: readFileSync(f, "utf8") }));
  css = files.filter((f) => f.endsWith(".css")).map((f) => ({ rel: rel(f), text: readFileSync(f, "utf8") }));
  js = files.filter((f) => f.endsWith(".js")).map((f) => ({ rel: rel(f), text: readFileSync(f, "utf8") }));
});

describe("V2 dist: CSP, scripts and third parties", () => {
  it("V2-01 every page's CSP <meta> is byte-identical to SITE_CSP", () => {
    expect(pages.length).toBeGreaterThan(15);
    for (const p of pages) {
      const m = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(p.html);
      expect(m?.[1]?.replace(/&#39;/g, "'"), p.rel).toBe(SITE_CSP);
    }
  });
  it("V2-02 / V2-03 no inline script, on* handler, javascript: URL, style attribute or <style> in dist HTML", () => {
    expect(pages.flatMap((p) => htmlInlineProblems(p.rel, p.html))).toEqual([]);
  });
  it("V2-04 no other origin and no data: URL in dist HTML or CSS", () => {
    expect([
      ...pages.flatMap((p) => htmlOriginProblems(p.rel, p.html)),
      ...css.flatMap((c) => cssOriginProblems(c.rel, c.text)),
    ]).toEqual([]);
  });
  it("V2-05 / V2-06 / V2-11 no trusted-types policy, embed, tracker or font loader in dist", () => {
    const all = [...pages.map((p) => ({ rel: p.rel, text: p.html })), ...css, ...js];
    expect(
      all.flatMap((f) => [
        ...trustedTypesProblems(f.rel, f.text),
        ...embedProblems(f.rel, f.text),
        ...fontLoaderProblems(f.rel, f.text),
      ]),
    ).toEqual([]);
  });
  it("V2-08 editorial pages ship no script; only the tool page has its one module", () => {
    for (const p of pages) {
      const scripts = [...p.html.matchAll(/<script\b(?![^>]*application\/ld\+json)[^>]*>/g)];
      expect(scripts.length, p.rel).toBe(p.rel === "tools/cash-vs-profit/index.html" ? 1 : 0);
    }
  });
});

describe("V2 dist: fonts", () => {
  it("V2-09 every built @font-face is a same-origin woff2 with swap; Fraunces is exactly 300/400", () => {
    expect(css.flatMap((c) => fontFaceProblems(c.rel, c.text))).toEqual([]);
  });
  it("V2-53 every built font file matches a committed, hash-pinned WOFF2 (the build serves the copies)", () => {
    const fonts = files.filter((f) => /\.(woff2?|ttf|otf)$/.test(f));
    expect(fonts).toHaveLength(5);
    expect(builtFontProblems(files, manifest)).toEqual([]);
  });
  it("V2-11 at most one font preload per page: Fraunces 300, same-origin, crossorigin; home has it", () => {
    expect(pages.flatMap((p) => preloadProblems(p.rel, p.html))).toEqual([]);
    expect(pages.find((p) => p.rel === "index.html")?.html).toMatch(/rel="preload"[^>]*fraunces-latin-300/);
  });
  it("V2-12 the built CSS keeps the Fraunces Fallback before serif", () => {
    expect(fallbackProblems("dist", css.map((c) => c.text).join("\n"))).toEqual([]);
  });
});

describe("V2 dist: reference assets", () => {
  it("V2-14 no reference-site name or Canela/Geist file in dist", () => {
    expect(
      files.flatMap((f) =>
        /\.(html|css|js|svg|txt|xml)$/.test(f)
          ? referenceProblems(rel(f), readFileSync(f, "utf8"))
          : referenceProblems(rel(f)),
      ),
    ).toEqual([]);
  });
});

describe("V2 dist: motion, focus and nav in built CSS", () => {
  it("V2-16 to V2-20, V2-24, V2-25 built CSS passes the V2 motion scan", () => {
    expect(css.length).toBeGreaterThan(0);
    expect(css.flatMap((c) => cssMotionProblems(c.rel, c.text, { tokens }))).toEqual([]);
  });
  it("V2-24 no page's h1 carries the reveal class", () => {
    for (const p of pages) expect(p.html, p.rel).not.toMatch(/<h1\b[^>]*class="[^"]*\breveal\b/);
  });
  it("V2-29 / V2-31 built CSS never removes focus and keeps the header >= 92% opaque", () => {
    expect(css.flatMap((c) => outlineRemovalProblems(c.rel, c.text))).toEqual([]);
    expect(css.flatMap((c) => navOpacityProblems(c.rel, c.text, tokens))).toEqual([]);
  });
});

describe("V2 dist: SVG", () => {
  it("V2-36 to V2-39, V2-54 to V2-56 every inline SVG and every served SVG passes the V2 rules", () => {
    const inline = pages.flatMap((p) => inlineSvgs(p.html).map((s, i) => ({ rel: `${p.rel}#svg${i}`, s })));
    expect(inline.length).toBeGreaterThan(20);
    const served = files.filter((f) => f.endsWith(".svg")).map((f) => ({ rel: rel(f), s: readFileSync(f, "utf8") }));
    expect([...inline, ...served].flatMap((x) => svgV2Problems(x.rel, x.s))).toEqual([]);
  });
});
