/**
 * V1-13 / V1-49 on the gallery build (dist-gallery/): the same SVG checks as
 * dist/, over the gallery and wireframe pages, and the V1 variants exist.
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { requireBuild } from "../helpers/built-site";
import { iconOnlyControls, imgProblems, pageSvgProblems } from "../helpers/v1-dist";
import { remoteProblems } from "../helpers/v1-source-scan";

const DIR = "dist-gallery";
let pages: { rel: string; html: string }[] = [];
beforeAll(() => {
  pages = requireBuild(DIR)
    .filter((f) => f.endsWith(".html"))
    .map((f) => ({ rel: relative(DIR, f).replace(/\\/g, "/"), html: readFileSync(f, "utf8") }));
});

describe("V1-13 gallery build SVG check", () => {
  it("V1-13 every inline <svg> in dist-gallery/ passes the Aegis rules, marking and dimension checks", () => {
    // The gallery index shows every art variant at once and is never deployed, so only it
    // skips the 40 KB per-page budget (V1-33 applies to site pages; every other rule applies).
    const budget = (rel: string) => rel !== "design/index.html";
    expect(
      pages.flatMap((p) => [
        ...pageSvgProblems(p.rel, p.html, { budget: budget(p.rel) }),
        ...imgProblems(p.rel, p.html),
      ]),
    ).toEqual([]);
    expect(pages.flatMap((p) => iconOnlyControls(p.rel, p.html))).toEqual([]);
    expect(pages.flatMap((p) => remoteProblems(p.rel, p.html, true))).toEqual([]);
  });
  it("V1-49 the gallery shows every icon, the hero, four pillars, six covers, the diagram and the demo chart", () => {
    const g = pages.find((p) => p.rel === "design/index.html")?.html ?? "";
    for (const icon of [
      "understand-the-numbers",
      "make-better-decisions",
      "finance-in-context",
      "build-capability",
      "cash-vs-profit",
    ])
      expect(g, icon).toContain(`data-icon="${icon}"`);
    expect(g.split('data-testid="hero-art"').length - 1).toBe(1);
    expect(g.split('data-testid="pillar-art"').length - 1).toBeGreaterThanOrEqual(4);
    const motifs = new Set([...g.matchAll(/data-motif="(\w+)"/g)].map((m) => m[1]));
    expect(motifs.size).toBe(6);
    expect(g).toContain('data-testid="diagram"');
    expect(g).toContain("Illustrative demo data");
    for (const id of ["card-hover", "card-focus", "card-long-other", "person-variant"]) expect(g, id).toContain(id);
  });
});

describe("V2 gallery entries (brief §10)", () => {
  it("V2 the gallery shows the hero, band and chip components in both motion states", () => {
    const g = pages.find((p) => p.rel === "design/index.html")?.html ?? "";
    for (const id of ["v2-hero-full", "v2-hero-reduce", "v2-band-ink", "v2-band-sand", "v2-chips"])
      expect(g, id).toContain(`data-testid="${id}"`);
    expect(g).toMatch(/data-testid="v2-hero-full"[^>]*data-motion="full"/);
    expect(g).toMatch(/data-testid="v2-hero-reduce"[^>]*data-motion="reduce"/);
    // The gallery adds no second h1 (the hero title is an h2 in display style).
    expect(g.match(/<h1\b/g)?.length).toBe(1);
    expect(g).toMatch(/class="link-list chip-list"/);
  });
  it("V2 the reduced-motion variant is static: gallery.css turns animation and transition off under it", () => {
    const css = readFileSync("src/styles/gallery.css", "utf8");
    expect(css).toMatch(
      /\[data-motion="reduce"\],\s*\[data-motion="reduce"\] \* \{\s*animation-name: none !important;\s*transition-property: none !important;/,
    );
  });
});
