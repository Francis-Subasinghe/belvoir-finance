/**
 * Negative fixtures for the dist-side V1 checks (tests/helpers/v1-dist.ts):
 * V1-18 marking, V1-35 dimensions, V1-20 icon-only links, V1-17 text in a
 * cover, V1-33 the per-page inline budget.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { iconOnlyControls, imgProblems, INLINE_SVG_PAGE_CAP, pageSvgProblems } from "../helpers/v1-dist";

const DIR = "tests/fixtures/v1/html";
const read = (n: string) => readFileSync(`${DIR}/${n}`, "utf8");
const all = (n: string) => {
  const html = read(n);
  return [...pageSvgProblems(n, html), ...imgProblems(n, html), ...iconOnlyControls(n, html)].map((p) => p.rule);
};
const NEGATIVE: Record<string, string> = {
  "svg-no-viewbox.html": "V1-35",
  "svg-not-marked.html": "V1-18",
  "svg-decorative-with-title.html": "V1-18",
  "img-no-dimensions.html": "V1-35",
  "icon-only-link.html": "V1-20",
  "cover-with-text.html": "V1-17",
};

describe("V1 dist-check negative fixtures", () => {
  it("every fixture in tests/fixtures/v1/html/ has an expectation", () => {
    expect(readdirSync(DIR).sort()).toEqual(Object.keys(NEGATIVE).sort());
  });
  it.each(Object.entries(NEGATIVE))("%s fails %s", (n, rule) => {
    expect(all(n)).toContain(rule);
  });
  it("V1-33 a page over 40 KB of inline SVG fails (fixture page built from a valid 2 KB icon x 21)", () => {
    const icon = `<svg class="icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="${"M1 1h1".repeat(310)}" stroke="currentColor"></path></svg>`;
    expect(Buffer.byteLength(icon)).toBeLessThanOrEqual(2048);
    const page = `<main>${icon.repeat(21)}</main>`;
    const rules = pageSvgProblems("over-budget.html", page).map((p) => p.rule);
    expect(rules).toEqual(["V1-33"]);
    expect(Buffer.byteLength(page)).toBeGreaterThan(INLINE_SVG_PAGE_CAP);
  });
  it("V1-10 the id-collision fixture fails per page", () => {
    expect(pageSvgProblems("p", read("../svg/id-collision.html")).map((p) => p.rule)).toContain("V1-10");
  });
});
