/**
 * F2 design-system source scans (F2-03 to F2-07, F2-17, F2-30, F2-32 to
 * F2-34). Each scan runs on the real src/ tree and must find nothing, and on
 * negative fixtures in tests/fixtures/design/ that must fail, so a scanner
 * that matches nothing can't pass vacuously (AGENTS.md rule 7).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CSP_DIRECTIVES } from "../../src/config/site";
import { contrastRatio } from "../../src/lib/contrast";
import {
  type SourceFile,
  definedTokens,
  expandSelector,
  readSources,
  scanAstroDirectives,
  scanBreakpoints,
  scanGold,
  scanMotion,
  scanOutlineRemoval,
  scanStrayColours,
  scanTokenDeclarations,
  scanVarResolution,
  styleRanges,
  surfaceOf,
  walkFiles,
} from "../helpers/design-scan";

const FIX = "tests/fixtures/design";
const src = readSources("src");
const tokens: SourceFile = { path: "src/styles/tokens.css", text: readFileSync("src/styles/tokens.css", "utf8") };
const defined = definedTokens(tokens);

/** Load a fixture; `x.astro.fixture` is scanned as `x.astro` (kept out of astro check, lint and prettier). */
function fixture(name: string): SourceFile {
  return { path: join(FIX, name.replace(/\.fixture$/, "")), text: readFileSync(join(FIX, name), "utf8") };
}
const rules = (problems: { rule: string }[]) => problems.map((p) => p.rule);

describe("design scan sanity", () => {
  it("reads the real component tree (not vacuous)", () => {
    const paths = src.map((f) => f.path.replace(/\\/g, "/"));
    for (const p of [
      "src/styles/tokens.css",
      "src/styles/global.css",
      "src/styles/components.css",
      "src/components/StoryCard.astro",
      "src/components/ChartWrapper.astro",
    ]) {
      expect(paths).toContain(p);
    }
  });

  it("expands :is()/:where() lists and reads the last surface class", () => {
    expect(expandSelector(":is(.a, .b) :where(.c, .d)")).toEqual([".a .c", ".a .d", ".b .c", ".b .d"]);
    expect(surfaceOf(".surface-navy a")).toBe("dark");
    expect(surfaceOf(".surface-navy .surface-white a")).toBe("light");
    expect(surfaceOf(".card:not(.surface-slate) a")).toBe("none");
  });
});

describe("F2-03 tokens are declared once, in :root of tokens.css", () => {
  it("no other file under src/ declares a custom property", () => {
    expect(scanTokenDeclarations(src)).toEqual([]);
  });
  it("tokens.css declares the new F2 token families", () => {
    for (const name of [
      "--color-status-info-bg",
      "--color-status-error-accent",
      "--color-callout-fact",
      "--color-callout-opinion",
      "--color-error",
      "--color-chart-series-1",
      "--color-chart-series-2",
      "--color-chart-bg",
      "--measure",
      "--container-max",
      "--motion-duration-fast",
      "--motion-duration-base",
      "--motion-ease-standard",
    ]) {
      expect(defined.has(name), name).toBe(true);
    }
  });
  it("negative fixture: a --color-* declared outside tokens.css fails", () => {
    expect(rules(scanTokenDeclarations([fixture("token-outside.css")]))).toContain("token-outside-tokens");
  });
});

describe("F2-04 no stray colour values under src/", () => {
  it("src/ has no hex, rgb(), hsl(), oklch() or named colours outside tokens.css", () => {
    expect(scanStrayColours(src)).toEqual([]);
  });
  it.each([
    ["stray-colour.astro.fixture", "stray-colour"],
    ["stray-named-colour.css", "named-colour"],
    ["svg-literal.astro.fixture", "svg-literal"],
    ["gold-rgb-literal.css", "stray-colour"],
  ])("negative fixture %s fails (%s)", (name, rule) => {
    expect(rules(scanStrayColours([fixture(name)]))).toContain(rule);
  });
  it("positive fixture: transparent, currentColor, inherit and none pass", () => {
    expect(scanStrayColours([fixture("allowed-keywords.css")])).toEqual([]);
  });
});

describe("F2-05 every var() resolves to a token", () => {
  it("every var(--…) under src/ is defined in tokens.css", () => {
    expect(scanVarResolution(src, defined)).toEqual([]);
  });
  it("negative fixture: var(--color-goldd) fails", () => {
    const p = scanVarResolution([fixture("var-typo.css")], defined);
    expect(p.map((x) => x.message).join()).toContain("--color-goldd");
  });
});

describe("F2-06 gold rule source scan (PostCSS)", () => {
  it("src/ passes: gold only under .surface-navy/.surface-slate, #7E6026 never on them", () => {
    expect(scanGold(src)).toEqual([]);
  });
  it("the scanner learns aliases of gold from tokens.css", () => {
    // --color-focus-on-dark is F1's alias; usage without a dark scope must fail.
    expect(rules(scanGold([fixture("gold-alias.css")], { aliasSources: [tokens] }))).toContain("gold-unscoped");
  });
});

describe("F2-07 gold rule negative and positive fixtures", () => {
  const gold = (name: string) => rules(scanGold([fixture(name)], { aliasSources: [tokens] }));

  it.each([
    ["gold-unscoped.css", "gold-unscoped"],
    ["gold-one-unscoped-selector.css", "gold-unscoped"],
    ["gold-alias.css", "gold-unscoped"],
    ["gold-in-media.css", "gold-unscoped"],
    ["gold-literal.astro.fixture", "gold-literal"],
    ["gold-nesting.css", "gold-unscoped"],
    ["gold-is-list.css", "gold-unscoped"],
    ["gold-not-scope.css", "gold-unscoped"],
    ["gold-light-nested-in-dark.css", "gold-unscoped"],
    ["gold-transitive-alias.css", "gold-unscoped"],
    ["gold-rgb-literal.css", "gold-literal"],
    ["gold-ts-literal.ts.fixture", "gold-literal"],
    ["gold-on-light-on-dark.css", "gold-on-light-on-dark"],
  ])("%s fails (%s)", (name, rule) => {
    expect(gold(name)).toContain(rule);
  });

  it.each(["gold-scoped.css", "gold-nesting-scoped.css"])("%s passes", (name) => {
    expect(gold(name)).toEqual([]);
  });

  it("contrast fixtures: gold fails on white and alabaster, #7E6026 fails on slate", () => {
    expect(contrastRatio("#c5a059", "#ffffff").toFixed(2)).toBe("2.46");
    expect(contrastRatio("#c5a059", "#f8fafc").toFixed(2)).toBe("2.35");
    expect(contrastRatio("#7e6026", "#1c2541").toFixed(2)).toBe("2.58");
    for (const r of [
      contrastRatio("#c5a059", "#ffffff"),
      contrastRatio("#c5a059", "#f8fafc"),
      contrastRatio("#7e6026", "#1c2541"),
    ]) {
      expect(r).toBeLessThan(3);
    }
  });
});

describe("F2-17 breakpoints", () => {
  it("every width media query under src/ is min-width and one of 30rem, 48rem, 64rem", () => {
    expect(scanBreakpoints(src)).toEqual([]);
  });
  it("the breakpoints are documented in the tokens.css header and DESIGN_SYSTEM.md", () => {
    const doc = readFileSync("docs/design/DESIGN_SYSTEM.md", "utf8");
    for (const bp of ["30rem", "48rem", "64rem"]) {
      expect(tokens.text).toContain(bp);
      expect(doc).toContain(bp);
    }
  });
  it("negative fixture: @media (min-width: 700px) fails", () => {
    expect(rules(scanBreakpoints([fixture("breakpoint-700.css")]))).toContain("unknown-breakpoint");
  });
  it("negative fixture: max-width (desktop-first) fails", () => {
    expect(rules(scanBreakpoints([fixture("breakpoint-max-width.css")]))).toContain("not-mobile-first");
  });
});

describe("F2-30 focus indicators are never removed without a replacement", () => {
  it("src/ passes", () => {
    expect(scanOutlineRemoval(src)).toEqual([]);
  });
  it("negative fixture: outline: none and outline: 0 fail", () => {
    expect(scanOutlineRemoval([fixture("outline-none.css")])).toHaveLength(2);
  });
  it("positive fixture: outline: none with a box-shadow ring passes", () => {
    expect(scanOutlineRemoval([fixture("outline-replaced.css")])).toEqual([]);
  });
  it("the global focus ring is 3px of --color-focus with an offset", () => {
    const css = readFileSync("src/styles/global.css", "utf8");
    expect(css).toMatch(/:focus-visible \{\s*outline: var\(--focus-width\) solid var\(--color-focus\);/);
    expect(tokens.text).toMatch(/--focus-width: 3px;/);
  });
});

describe("F2-32 motion", () => {
  it("motion tokens exist", () => {
    for (const t of ["--motion-duration-fast", "--motion-duration-base", "--motion-ease-standard"]) {
      expect(defined.has(t)).toBe(true);
    }
  });
  it("every transition/animation under src/ uses --motion-* tokens and nothing loops", () => {
    expect(scanMotion(src)).toEqual([]);
  });
  it("negative fixture: raw durations and infinite loops fail", () => {
    const r = rules(scanMotion([fixture("motion-raw.css")]));
    expect(r).toContain("motion-token");
    expect(r).toContain("motion-loop");
  });
  it("F1's global reduced-motion rule is kept", () => {
    const css = readFileSync("src/styles/global.css", "utf8");
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*animation: none !important;[\s\S]*transition: none !important;[\s\S]*scroll-behavior: auto !important;/,
    );
  });
});

describe("F2-33 CSP is the F1 value plus Aegis Q-9 (F4)", () => {
  it("CSP_DIRECTIVES deep-equals the F1 value with connect-src 'none' and require-trusted-types-for 'script'", () => {
    expect(CSP_DIRECTIVES).toStrictEqual({
      "default-src": "'self'",
      "script-src": "'self'",
      "style-src": "'self'",
      "img-src": "'self'",
      "font-src": "'self'",
      "connect-src": "'none'",
      "object-src": "'none'",
      "base-uri": "'self'",
      "form-action": "'self'",
      "upgrade-insecure-requests": "",
      "require-trusted-types-for": "'script'",
    });
  });
});

describe("F2-34 no inline styles or scripts in components", () => {
  it("no define:vars, style= or set:html (JsonLd.astro is the one documented set:html) and no <script>", () => {
    expect(scanAstroDirectives(src)).toEqual([]);
  });
  it("negative fixture: style=, set:html and define:vars fail", () => {
    const r = rules(scanAstroDirectives([fixture("directives.astro.fixture")]));
    expect(r).toEqual(expect.arrayContaining(["style-attr", "set-html", "define-vars"]));
  });
  it('build.inlineStylesheets stays "never"', () => {
    expect(readFileSync("astro.config.mjs", "utf8")).toMatch(/inlineStylesheets:\s*"never"/);
  });
});

describe("Style ranges instead of text stripping (CodeQL js/incomplete-multi-character-sanitization)", () => {
  it("<sty<style></style>le>: the only style block is the inner <style></style>; the rest stays markup", () => {
    const text = "<sty<style></style>le>";
    expect(styleRanges(text)).toEqual([{ start: 4, end: 19, cssStart: 11, cssEnd: 11 }]);
    expect(text.slice(19)).toBe("le>");
  });

  it("<style><style></style>x</style>: the block ends at the first </style>, like the HTML tokenizer", () => {
    const text = "<style><style></style>x</style>";
    const blocks = styleRanges(text);
    expect(blocks).toHaveLength(1);
    expect(text.slice(blocks[0]?.cssStart, blocks[0]?.cssEnd)).toBe("<style>");
    expect(blocks[0]?.end).toBe(22);
    expect(text.slice(22)).toBe("x</style>");
  });

  it("an unterminated <style> runs to the end of the text", () => {
    expect(styleRanges("<p></p><style>.a{}")).toEqual([{ start: 7, end: 18, cssStart: 14, cssEnd: 18 }]);
  });

  it("the split-tag fixture: the style attribute after it is still caught", () => {
    expect(rules(scanAstroDirectives([fixture("style-split-tag.astro.fixture")]))).toContain("style-attr");
  });

  it("the nested-open fixture: set:html and style= after the first </style> are still caught", () => {
    const r = rules(scanAstroDirectives([fixture("style-nested-open.astro.fixture")]));
    expect(r).toEqual(expect.arrayContaining(["set-html", "style-attr"]));
  });

  it("the frontmatter-divider fixture: set:html is caught, where the old single-pass strip missed it", () => {
    const f = fixture("style-frontmatter-divider.astro.fixture");
    expect(rules(scanAstroDirectives([f]))).toContain("set-html");
    // Prove the OLD logic gets this file wrong, without running a strip: the old frontmatter
    // pattern ended at the "---" inside the comment, and the old style pattern, applied to what was
    // left, matched from the frontmatter's "<style>" string to the real </style>, a span that covers
    // the set:html. (Patterns rebuilt from strings so the single-pass guard below doesn't match.)
    const oldFrontmatter = new RegExp(["^---", "[\\s\\S]*?", "---"].join(""));
    const oldStyle = new RegExp(["<style\\b", "[\\s\\S]*?", "<\\/style\\b[^>]*>"].join(""), "i");
    const fmEnd = oldFrontmatter.exec(f.text)?.[0].length ?? 0;
    expect(fmEnd).toBeLessThan(f.text.indexOf("const open"));
    const rest = f.text.slice(fmEnd);
    const m = oldStyle.exec(rest);
    const hit = rest.indexOf("<div set:html");
    expect(m).not.toBeNull();
    expect(hit).toBeGreaterThan(m?.index ?? Infinity);
    expect(hit).toBeLessThan((m?.index ?? 0) + (m?.[0].length ?? 0));
  });

  it("text inside a real <style> block is not treated as markup (and the file text is never modified)", () => {
    const f = fixture("style-content-only.astro.fixture");
    const before = f.text;
    expect(scanAstroDirectives([f])).toEqual([]);
    expect(f.text).toBe(before);
  });

  it("no code under src/, scripts/ or tests/ strips tags or fences with a single-pass replace()", () => {
    // A literal-regex replace with "" whose pattern contains a tag "<" or a "---"/"-->" fence is a
    // single-pass multi-character strip (CodeQL js/incomplete-multi-character-sanitization); use ranges.
    // Single-character cleanups (quotes, leading slashes, a ".fixture" suffix) aren't sanitisers and stay.
    const strip = /\.replace\(\s*\/(?:\\.|[^/\\\n])*(?:<|---|-->)(?:\\.|[^/\\\n])*\/[gimsuy]*\s*,\s*(""|''|``)\s*\)/;
    const files = ["src", "scripts", "tests"].flatMap((d) => walkFiles(d, [".ts", ".tsx", ".astro", ".mjs", ".js"]));
    expect(files.length).toBeGreaterThan(20);
    expect(files.filter((f) => strip.test(readFileSync(f, "utf8")))).toEqual([]);
    // The pattern does catch the old CodeQL finding (not vacuous).
    // (Built by concatenation so this file doesn't match itself.)
    const oldFinding = ["x.rep", "lace(/", "<style\\b[\\s\\S]*?<\\/style\\b[^>]*>", '/gi, "")'].join("");
    expect(strip.test(oldFinding)).toBe(true);
    expect(strip.test(["t.rep", "lace(/", "^---[\\s\\S]*?---", '/, "")'].join(""))).toBe(true);
  });
});
