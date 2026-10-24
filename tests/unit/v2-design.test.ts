/**
 * V2 visual refresh (AC_V2_DESIGN.md v0.2): the source-side checks over src/,
 * public/ and the configs, and every negative fixture in tests/fixtures/v2/
 * failing the same check with its AC ID (AGENTS.md rule 7). The dist/ side is
 * tests/build/v2-dist.test.ts; the rendered side tests/e2e/v2-design.spec.ts.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CSP_DIRECTIVES, cspString } from "../../src/config/site";
import { SITE_CSP } from "../helpers/csp";
import { readSources, scanGold, type SourceFile } from "../helpers/design-scan";
import { tokenMap } from "../helpers/motion-scan";
import { V2_FIXTURES } from "../helpers/v2-fixtures";
import {
  cssMotionProblems,
  cssOriginProblems,
  embedProblems,
  fallbackProblems,
  fontFaceProblems,
  fontFileProblems,
  fontLoaderProblems,
  type FontManifestEntry,
  htmlInlineProblems,
  htmlOriginProblems,
  ids,
  navOpacityProblems,
  outlineRemovalProblems,
  referenceProblems,
  svgV2Problems,
  trustedTypesProblems,
  type V2Problem,
  visualConfigProblems,
} from "../helpers/v2-scan";

const FIX = "tests/fixtures/v2";
const read = (p: string) => readFileSync(p, "utf8");
const tokensCss = read("src/styles/tokens.css");
const tokens = tokenMap(tokensCss);
const tokensFile: SourceFile = { path: "src/styles/tokens.css", text: tokensCss };
const manifest = JSON.parse(read("src/fonts/font-hashes.json")) as FontManifestEntry[];
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const srcCss = walk("src/styles")
  .filter((f) => f.endsWith(".css"))
  .map((f) => ({ path: f, text: read(f) }));
const noComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const allCss = noComments(srcCss.map((f) => f.text).join("\n"));

/** Runs the real check that guards each fixture's AC. */
function check(name: string): V2Problem[] {
  const p = join(FIX, name);
  const text = name.endsWith("/") ? "" : read(p);
  if (name.startsWith("fonts-")) {
    const m = JSON.parse(read(join(p, "manifest.json"))) as FontManifestEntry[];
    return fontFileProblems(p.replace(/\/$/, ""), m);
  }
  if (name === "font-canela.woff2") return referenceProblems(p);
  if (name.endsWith(".astro.fixture")) return referenceProblems(p, text);
  if (name.endsWith(".ts.fixture")) return visualConfigProblems(p, text);
  if (name.endsWith(".svg")) return svgV2Problems(p, text);
  if (name.endsWith(".js")) return [...trustedTypesProblems(p, text), ...fontLoaderProblems(p, text)];
  if (name.endsWith(".html"))
    return [...htmlInlineProblems(p, text), ...htmlOriginProblems(p, text), ...embedProblems(p, text)];
  // CSS
  const gold = scanGold([{ path: p, text }], { aliasSources: [tokensFile] }).map((x) => ({
    id: "V2-28",
    file: p,
    message: x.message,
  }));
  return [
    ...cssOriginProblems(p, text),
    ...fontFaceProblems(p, text, { requireFraunces: false }),
    ...cssMotionProblems(p, text, { tokens }),
    ...gold,
    ...outlineRemovalProblems(p, text),
    ...navOpacityProblems(p, text, tokens),
  ];
}

describe("V2 negative fixtures (tests/fixtures/v2/)", () => {
  it("V2-52 every fixture has an expectation, and there are 48", () => {
    const names = readdirSync(FIX).map((n) => (statSync(join(FIX, n)).isDirectory() ? `${n}/` : n));
    expect(names.sort()).toEqual(Object.keys(V2_FIXTURES).sort());
    expect(names).toHaveLength(48);
  });
  it.each(Object.entries(V2_FIXTURES).flatMap(([f, acs]) => acs.map((id) => [`${id} ${f} fails`, f, id] as const)))(
    "%s",
    (_t, f, id) => {
      expect(ids(check(f))).toContain(id);
    },
  );
});

describe("V2 section 1: CSP, scripts and third parties (source)", () => {
  it("V2-01 the CSP policy string is unchanged (SITE_CSP)", () => {
    expect(cspString(CSP_DIRECTIVES)).toBe(SITE_CSP);
    expect(SITE_CSP).toContain("require-trusted-types-for 'script'");
    expect(SITE_CSP).not.toMatch(/(^|;\s*)trusted-types\s/);
  });
  it("V2-03 no style attribute or <style> block in any .astro source", () => {
    const astro = readSources("src", [".astro"]);
    expect(astro.length).toBeGreaterThan(20);
    for (const f of astro) {
      expect(f.text, f.path).not.toMatch(/<style\b/);
      expect(f.text, f.path).not.toMatch(/\sstyle\s*=\s*["{]/);
    }
  });
  it("V2-05 / V2-06 / V2-11 no trusted-types policy, embed, tracker or font loader under src/", () => {
    const files = readSources("src", [".astro", ".ts", ".css"]);
    const ps = files.flatMap((f) => [
      ...trustedTypesProblems(f.path, f.text),
      ...embedProblems(f.path, f.text),
      ...fontLoaderProblems(f.path, f.text),
    ]);
    expect(ps).toEqual([]);
  });
  it("V2-08 the only dependency change is @fontsource/fraunces 5.3.0 (exact) added and Source Serif removed", () => {
    const pkg = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["@fontsource/fraunces"]).toBe("5.3.0");
    expect(pkg.dependencies["@fontsource/source-serif-4"]).toBeUndefined();
    expect(Object.keys(pkg.dependencies).sort()).toEqual(
      [
        "@astrojs/markdoc",
        "@fontsource/fraunces",
        "@fontsource/ibm-plex-mono",
        "@fontsource/inter",
        "@markdoc/markdoc",
        "astro",
      ].sort(),
    );
  });
  it("V2-22 no IntersectionObserver or .is-hidden reveal pattern under src/", () => {
    for (const f of readSources("src", [".astro", ".ts", ".css"])) {
      expect(f.text, f.path).not.toMatch(/IntersectionObserver|\bis-hidden\b/);
    }
  });
});

describe("V2 section 2: fonts (source)", () => {
  it("V2-09 every source @font-face is a same-origin woff2, swap, and Fraunces is exactly latin 300/400", () => {
    expect(fontFaceProblems("src/styles/fonts.css", read("src/styles/fonts.css"))).toEqual([]);
  });
  it("V2-10 / V2-53 every committed woff2 has a committed OFL beside it and matches its pinned sha256", () => {
    expect(manifest.length).toBe(5);
    expect(fontFileProblems("src/fonts", manifest)).toEqual([]);
    expect(new Set(manifest.map((m) => m.family))).toEqual(new Set(["Fraunces", "Inter", "IBM Plex Mono"]));
  });
  it("V2-12 Fraunces Fallback has size-adjust/ascent-override and every Fraunces stack lists it before serif", () => {
    expect(fallbackProblems("src/styles", srcCss.map((f) => f.text).join("\n"))).toEqual([]);
  });
});

describe("V2 section 3: reference assets", () => {
  it("V2-14 no reference-site name outside docs/, and no Canela/Geist font files", () => {
    const roots = ["src", "public", "content", "scripts", "tools"];
    const files = roots.flatMap((r) => walk(r));
    const ps = files.flatMap((f) =>
      /\.(woff2?|ttf|otf|png|jpe?g|webp)$/i.test(f) ? referenceProblems(f) : referenceProblems(f, read(f)),
    );
    expect(ps).toEqual([]);
    expect(read("package.json")).not.toMatch(/amadae|canela|geist/i);
  });
});

describe("V2 section 4: motion (source CSS)", () => {
  it("V2-16 to V2-20, V2-24, V2-25 src/ CSS passes the V2 motion scan", () => {
    const ps = srcCss.flatMap((f) => cssMotionProblems(f.path, f.text, { tokens }));
    expect(ps).toEqual([]);
  });
  it("V2-17 the motion tokens are one easing and 150/300/500 ms", () => {
    expect(tokens.get("--motion-ease")).toBe("cubic-bezier(0.4, 0, 0.2, 1)");
    expect([tokens.get("--motion-fast"), tokens.get("--motion-base"), tokens.get("--motion-slow")]).toEqual([
      "150ms",
      "300ms",
      "500ms",
    ]);
    expect(allCss).not.toMatch(/animation-delay/);
  });
  it("V2-18 fade-up is translateY(8px) -> 0 and the card lift is 2 px", () => {
    expect(read("src/styles/motion.css")).toMatch(
      /@keyframes fade-up \{\s*from \{\s*opacity: 0;\s*transform: translateY\(8px\);/,
    );
    expect(read("src/styles/motion.css")).toMatch(/transform: translateY\(-2px\)/);
  });
  it("V2-19 the reduced-motion reset removes every animation and sets transitions to --motion-none (0s)", () => {
    const css = read("src/styles/motion.css");
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\*,\s*\*::before,\s*\*::after \{\s*animation: none !important;\s*transition-duration: var\(--motion-none\) !important;\s*scroll-behavior: auto !important;/,
    );
    expect(tokens.get("--motion-none")).toBe("0s");
  });
  it("V2-24 no h1 rule animates, and the hero animates only the eyebrow and the CTAs (not the lead, the LCP at 360)", () => {
    const css = noComments(read("src/styles/motion.css"));
    expect(css).not.toMatch(/\bh1\b[^{]*\{[^}]*(animation|transition)/);
    const heroAnimated = [...css.matchAll(/(\.home-hero [^{]+)\{\s*animation:/g)].map((m) => (m[1] ?? "").trim());
    expect(heroAnimated).toEqual([
      ".home-hero .eyebrow",
      ".home-hero .hero-actions li:first-child",
      ".home-hero .hero-actions li + li",
    ]);
    expect(css).not.toMatch(/page-intro[^{]*\{[^}]*animation/);
  });
});

describe("V2 section 5: accessibility tokens and rules (source)", () => {
  it("V2-28 the gold rule holds over src/ with the V2 surfaces", () => {
    expect(scanGold(readSources("src"))).toEqual([]);
  });
  it("V2-29 focus is never removed and the ring is two-tone (ink outline + canvas inner ring; gold-bright on dark)", () => {
    expect(srcCss.flatMap((f) => outlineRemovalProblems(f.path, f.text))).toEqual([]);
    const g = read("src/styles/global.css");
    expect(g).toMatch(
      /:focus-visible \{\s*outline: var\(--focus-width\) solid var\(--color-focus\);\s*outline-offset: var\(--focus-offset\);\s*box-shadow: 0 0 0 var\(--focus-inner-width\) var\(--color-focus-inner\);/,
    );
    expect(g).toMatch(/outline-color: var\(--color-focus-on-dark\);/);
    expect(tokens.get("--focus-width")).toBe("3px");
    expect(tokens.get("--focus-inner-width")).toBe("2px");
  });
  it("V2-31 the sticky header is >= 92% opaque with no backdrop-filter", () => {
    expect(navOpacityProblems("src/styles/components.css", read("src/styles/components.css"), tokens)).toEqual([]);
    expect(tokens.get("--color-header-bg")).toBe("rgb(251 251 249 / 0.96)");
  });
});

describe("V2 section 6: SVG (source)", () => {
  it("V2-36 to V2-39, V2-54 to V2-56 every committed SVG passes the V2 SVG rules", () => {
    const svgs = [...walk("src/assets"), "public/favicon.svg"].filter((f) => f.endsWith(".svg"));
    expect(svgs.length).toBeGreaterThan(8);
    expect(svgs.flatMap((f) => svgV2Problems(f, read(f)))).toEqual([]);
  });
  it("V2-55 the positive control: <animate> on a non-link attribute and an https <a> pass", () => {
    const ok =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><a href="https://example.org/"><rect width="10" height="10"><animate attributeName="opacity" from="0" to="1" dur="0.15s"/></rect></a><use href="#r"/></svg>';
    expect(svgV2Problems("ok.svg", ok)).toEqual([]);
  });
});

describe("V2 section 7: visual gate", () => {
  it("V2-45 playwright.visual.config.ts sets use.reducedMotion 'reduce' and keeps animations 'disabled'", () => {
    expect(visualConfigProblems("playwright.visual.config.ts", read("playwright.visual.config.ts"))).toEqual([]);
  });
  it("V2-49 breakpoints in src/ CSS are min-width 30/48/64rem only", () => {
    for (const m of allCss.matchAll(/@media\s*\(([^)]*width[^)]*)\)/g)) {
      expect(m[1]).toMatch(/^min-width: (30|48|64)rem$/);
    }
  });
});
