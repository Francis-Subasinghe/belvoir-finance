/**
 * V1-23 to V1-28, V1-31, V1-57: the motion scan over src/ CSS, and every
 * negative fixture in tests/fixtures/v1/css/ failing the same function.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readSources, cssChunks } from "../helpers/design-scan";
import { scanV1Motion, tokenMap, type MotionRule } from "../helpers/motion-scan";

const DIR = "tests/fixtures/v1/css";
const tokens = tokenMap(readFileSync("src/styles/tokens.css", "utf8"));
const fixture = (n: string) => scanV1Motion([{ file: n, css: readFileSync(join(DIR, n), "utf8") }], tokens);

const NEGATIVE: Record<string, MotionRule> = {
  "keyframes-height.css": "V1-23",
  "keyframes-top.css": "V1-23",
  "keyframes-box-shadow.css": "V1-23",
  "transition-all.css": "V1-23",
  "animation-outside-guard.css": "V1-24",
  "scroll-timeline-without-supports.css": "V1-24",
  "fill-both.css": "V1-26",
  "fill-backwards.css": "V1-26",
  "base-opacity.css": "V1-26",
  "iteration-infinite.css": "V1-27",
  "over-one-second.css": "V1-27",
  "flash.css": "V1-27",
  "stagger-over-cap.css": "V1-28",
  "blink-delayed-fade.css": "V1-57",
  "chart-draw-over-cap.css": "V1-31",
};

/** All CSS under src/: .css files and every .astro <style> block. */
export function srcCss() {
  return readSources("src", [".css", ".astro"]).flatMap((f) =>
    cssChunks(f).map((c, i) => ({ file: `${f.path}#${i}`, css: c.css })),
  );
}

describe("V1-23 to V1-57 motion scan", () => {
  it("V1-23 every fixture in tests/fixtures/v1/css/ has an expectation", () => {
    expect(
      readdirSync(DIR)
        .filter((f) => f !== "positive.css")
        .sort(),
    ).toEqual(Object.keys(NEGATIVE).sort());
  });
  it.each(Object.entries(NEGATIVE).map(([f, id]) => [`${id} ${f} fails`, f, id] as const))("%s", (_t, f, id) => {
    expect(fixture(f).map((p) => p.rule)).toContain(id);
  });
  it("V1-23 the positive fixture (guarded, transform/opacity, bounded) passes", () => {
    expect(fixture("positive.css")).toEqual([]);
  });
  it("V1-23 to V1-28 src/ CSS passes the motion scan", () => {
    const css = srcCss();
    expect(css.length).toBeGreaterThan(3);
    expect(scanV1Motion(css, tokens)).toEqual([]);
  });
  it("V1-24 F1's global reduce rule is still there", () => {
    expect(readFileSync("src/styles/global.css", "utf8")).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*animation: none !important;[\s\S]*transition: none !important;/,
    );
  });
});
