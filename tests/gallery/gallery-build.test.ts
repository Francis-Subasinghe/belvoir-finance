/**
 * The gallery test build (dist-gallery/, BELVOIR_GALLERY=1). Never deployed.
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { F1_CSP, compiledGold, cspOf, galleryLeaks, requireBuild } from "../helpers/built-site";
import { countTags, scriptBlocks } from "../helpers/html";
import { expectedSite } from "../helpers/expected-site";

const DIR = "dist-gallery";
let files: string[] = [];
let pages: { rel: string; html: string }[] = [];

beforeAll(() => {
  files = requireBuild(DIR);
  pages = files
    .filter((f) => f.endsWith(".html"))
    .map((f) => ({ rel: relative(DIR, f).replace(/\\/g, "/"), html: readFileSync(f, "utf8") }));
});

describe("F2-01 gallery test build", () => {
  it("builds the gallery and the 7 D12 wireframes alongside the normal pages", () => {
    const rel = pages.map((p) => p.rel).sort();
    expect(rel).toEqual(
      [
        "404.html",
        "design/index.html",
        ...["explore", "home", "sources", "story", "tool", "tools", "topic"].map(
          (s) => `design/wireframes/${s}/index.html`,
        ),
        ...expectedSite().pages,
      ].sort(),
    );
  });
  it("gallery pages use BaseLayout, have one h1, the gallery marker and noindex", () => {
    for (const { rel, html } of pages.filter((p) => p.rel.startsWith("design/"))) {
      expect(countTags(html, "h1"), rel).toBe(1);
      expect(html, rel).toContain('data-testid="design-gallery"');
      expect(html, rel).toContain('<meta name="robots" content="noindex, nofollow">');
      expect(html, rel).toContain('<a class="skip-link" href="#main">');
      expect(html, rel).toContain('data-testid="not-advice-notice"');
    }
  });
});

describe("F2-08 gold rule in the gallery's compiled CSS", () => {
  it("gallery-only CSS is covered and passes", () => {
    expect(files.some((f) => /gallery\.[\w-]+\.css$/.test(f))).toBe(true);
    const { problems, goldRules } = compiledGold(files);
    expect(goldRules).toBeGreaterThan(0);
    expect(problems).toEqual([]);
  });
});

describe("F2-33 / F2-34 CSP and no inline code in the gallery build", () => {
  it("every gallery page carries the unchanged F1 CSP", () => {
    for (const { rel, html } of pages) expect(cspOf(html), rel).toBe(F1_CSP);
  });
  it("no style= attributes, <style> elements, on* handlers or non-JSON-LD inline scripts", () => {
    for (const { rel, html } of pages) {
      expect(html, rel).not.toMatch(/\sstyle="/i);
      expect(countTags(html, "style"), rel).toBe(0);
      expect(html, rel).not.toMatch(/<[^>]+\son[a-z]+\s*=/i);
      for (const { attrs } of scriptBlocks(html)) {
        if (!/\bsrc\s*=/.test(attrs)) expect(attrs, rel).toMatch(/application\/ld\+json/);
      }
    }
  });
  it("gallery forms have no external action", () => {
    for (const { rel, html } of pages) expect(html, rel).not.toMatch(/<form[^>]*\saction=/i);
  });
});

describe("F2-40 negative check: the dist detector can see the gallery", () => {
  it("galleryLeaks() flags the gallery build (so a clean dist/ result is meaningful)", () => {
    const leaks = galleryLeaks(DIR, files);
    expect(leaks.some((l) => l.startsWith("path: design/"))).toBe(true);
    expect(leaks.some((l) => l.includes("design-gallery"))).toBe(true);
  });
});
