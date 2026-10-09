/**
 * V1 assertions on the built site (dist/), run by postbuild. The same
 * functions run over dist-gallery/ in tests/gallery/v1-gallery.test.ts.
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { gzipSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import { requireBuild } from "../helpers/built-site";
import { scriptPolicyProblems } from "../helpers/f4-dist";
import { inlineSvgs } from "../helpers/svg-check";
import {
  GZIP_GROWTH_CAP,
  iconOnlyControls,
  imgProblems,
  inlineSvgBytes,
  INLINE_SVG_PAGE_CAP,
  pageSvgProblems,
} from "../helpers/v1-dist";
import {
  fontFaceProblems,
  lazyAboveFoldProblems,
  rasterFileProblems,
  rasterImgProblems,
  remoteProblems,
} from "../helpers/v1-source-scan";
import { checkContentRules } from "../../src/lib/content-rules";
import { coverFor } from "../../src/lib/cover";

const DIST = "dist";
let files: string[] = [];
let pages: { rel: string; html: string }[] = [];
const rel = (f: string) => relative(DIST, f).replace(/\\/g, "/");
const page = (r: string) => pages.find((p) => p.rel === r)?.html ?? "";

beforeAll(() => {
  files = requireBuild(DIST);
  pages = files.filter((f) => f.endsWith(".html")).map((f) => ({ rel: rel(f), html: readFileSync(f, "utf8") }));
});

describe("V1-13 the SVG check runs on the real output", () => {
  it("V1-05..V1-11, V1-17, V1-18, V1-35 every inline <svg> on every page passes, with no id collisions", () => {
    expect(pages.flatMap((p) => pageSvgProblems(p.rel, p.html))).toEqual([]);
    const total = pages.reduce((n, p) => n + inlineSvgs(p.html).length, 0);
    expect(total, "inline SVGs found (not vacuous)").toBeGreaterThanOrEqual(30);
  });
  it("V1-18 / V1-35 every <img> has alt and dimensions (there are none in V1)", () => {
    expect(pages.flatMap((p) => imgProblems(p.rel, p.html))).toEqual([]);
  });
  it("V1-20 no link or button is icon-only", () => {
    expect(pages.flatMap((p) => iconOnlyControls(p.rel, p.html))).toEqual([]);
  });
});

describe("V1-04 / V1-36 / V1-37 nothing remote, no new fonts, no rasters in dist/", () => {
  it("V1-04 dist HTML, CSS and SVG load nothing from another origin and contain no @import", () => {
    const scanned = files.filter((f) => /\.(html|css|svg)$/.test(f));
    expect(scanned.flatMap((f) => remoteProblems(rel(f), readFileSync(f, "utf8"), true))).toEqual([]);
  });
  it("V1-36 compiled @font-face rules are the approved set, real faces from same-origin /_astro/ files", () => {
    const css = files.filter((f) => f.endsWith(".css"));
    expect(css.flatMap((f) => fontFaceProblems(rel(f), readFileSync(f, "utf8"), true))).toEqual([]);
  });
  it("V1-37 no raster file in dist/, no <img> raster, no lazy image above the fold", () => {
    expect(rasterFileProblems(files.map((f) => `dist/${rel(f)}`))).toEqual([]);
    expect(
      pages.flatMap((p) => [...rasterImgProblems(p.rel, p.html), ...lazyAboveFoldProblems(p.rel, p.html)]),
    ).toEqual([]);
  });
});

describe("V1-33 page weight", () => {
  const baseline = JSON.parse(readFileSync("tests/fixtures/v1/f3-html-sizes.json", "utf8")) as {
    pages: Record<string, { raw: number; gzip: number }>;
  };
  it("V1-33 inline SVG is at most 40 KB per page", () => {
    for (const p of pages) expect(inlineSvgBytes(p.html), p.rel).toBeLessThanOrEqual(INLINE_SVG_PAGE_CAP);
  });
  it("V1-33 each page's gzip size grew by at most 15 KB over F3", () => {
    for (const p of pages) {
      const before = baseline.pages[p.rel]?.gzip;
      expect(before, `${p.rel} has an F3 baseline`).toBeDefined();
      const now = gzipSync(Buffer.from(p.html), { level: 9 }).length;
      expect(now - (before ?? 0), p.rel).toBeLessThanOrEqual(GZIP_GROWTH_CAP);
    }
  });
});

describe("V1-41 / V1-42 art placement", () => {
  const report = checkContentRules("content");
  const topics = report.entries.filter((e) => e.collection === "topics");
  const published = report.entries.filter((e) => e.collection === "stories" && e.raw["status"] === "published");

  it("V1-41 each Topic page and its Home card show the illustration and icon of its pillar", () => {
    const home = page("index.html");
    expect(topics.length).toBeGreaterThan(0);
    for (const t of topics) {
      const pillar = String(t.raw["pillar"]);
      const html = page(`topics/${t.id}/index.html`);
      expect(html, t.id).toContain(`data-pillar="${pillar}"`);
      expect(html, t.id).toContain(`data-icon="${pillar}"`);
      const card = home.split('data-testid="topic-card"').find((c) => c.includes(`/topics/${t.id}/`)) ?? "";
      expect(card, t.id).toContain(`data-pillar="${pillar}"`);
      expect(card, t.id).toContain(`data-icon="${pillar}"`);
    }
  });
  it("V1-42 every StoryCard and every story page shows the cover derived from id + first pillar", () => {
    let cards = 0;
    for (const p of pages) {
      const parts = p.html.split('data-testid="story-card"').slice(1);
      for (const c of parts) {
        cards++;
        expect(c.split("</article>")[0], p.rel).toContain('data-testid="story-cover"');
      }
    }
    expect(cards).toBeGreaterThan(5);
    for (const s of published) {
      const pillars = s.raw["pillars"] as string[];
      const html = page(`stories/${s.id}/index.html`);
      expect(html, s.id).toContain(
        `story-cover-page surface-navy" data-testid="story-cover" data-motif="${coverFor(s.id, pillars[0] ?? "").motif}"`,
      );
    }
  });
  it("V1-42 the published demo stories have visibly different covers", () => {
    const demo = published.filter((s) => s.raw["demo"] === true);
    const motifs = demo.map((s) => coverFor(s.id, (s.raw["pillars"] as string[])[0] ?? "").motif);
    expect(demo.length).toBeGreaterThanOrEqual(2);
    expect(new Set(motifs).size).toBe(motifs.length);
  });
  it("V1-29 the hero art is never animated: it has no motion class and sits outside every animated selector", () => {
    const css = files
      .filter((f) => f.endsWith(".css"))
      .map((f) => readFileSync(f, "utf8"))
      .join("\n");
    expect(css).not.toMatch(/art-panel-hero[^{]*\{[^}]*animation/);
    expect(css).not.toMatch(/demo-banner[^{]*\{[^}]*animation/);
  });
});

describe("V1-44 / V1-55 charts in demo stories", () => {
  it("V1-44 at least two demo stories render a chart, each captioned as illustrative demo data", () => {
    const withCharts = pages.filter((p) => p.html.includes('data-testid="chart"'));
    expect(withCharts.length).toBeGreaterThanOrEqual(2);
    for (const p of withCharts) {
      expect(p.html, p.rel).toContain('<meta name="belvoir-demo" content="true">');
      for (const chart of p.html.split('data-testid="chart"').slice(1)) {
        const caption = chart.split("</figcaption>")[0] ?? "";
        expect(caption, p.rel).toContain("Illustrative demo data");
        expect(caption, p.rel).toMatch(/Source: [^<]*\(placeholder\)/);
      }
    }
  });
  it("V1-45 / F3-38 still no script but JSON-LD anywhere, except the tool page's one module (F4-46, F4-59)", () => {
    expect(
      scriptPolicyProblems(
        pages.map((p) => ({ page: p.rel, html: p.html })),
        files.filter((f) => f.endsWith(".js")).map(rel),
      ),
    ).toEqual([]);
  });
});

describe("V1-47 source notes", () => {
  it('V1-47 every source note reads "Source: name, publisher. Accessed date." with one space', () => {
    let n = 0;
    for (const p of pages)
      for (const m of p.html.matchAll(/<p class="source-note"[^>]*>([\s\S]*?)<\/p>/g)) {
        n++;
        // Text nodes only (the segments between tags), whitespace collapsed as a browser does.
        const text = [...(m[1] ?? "").matchAll(/(?:^|>)([^<]*)/g)]
          .map((t) => t[1] ?? "")
          .join("")
          .replace(/\s+/g, " ")
          .trim();
        expect(text, p.rel).toMatch(/^Source: \S[^,]*, [^.]+\. Accessed \d{1,2} [A-Z][a-z]+ \d{4}\.$/);
        expect(text, p.rel).not.toMatch(/Source:\S| ,/);
      }
    expect(n).toBeGreaterThan(0);
  });
});
