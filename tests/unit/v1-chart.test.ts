/**
 * V1-54 / V1-55 / F3-39: the strict Markdoc `chart` tag. Every fixture goes
 * through the real Markdoc validation (checkMarkdoc, which `check:content`
 * and the build run) and the same chartProblems() the content rules use.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import markdocConfig from "../../markdoc.config";
import { checkMarkdoc } from "../../src/lib/content-check";
import { chartTags } from "../../src/lib/content-rules";
import { allowedTagNames, CHART_LIMITS, chartProblems } from "../../src/lib/markdoc-allowlist";

const DIR = "tests/fixtures/v1/chart";
const read = (n: string) => readFileSync(join(DIR, n), "utf8");

/** Fixture -> the rule (or Markdoc parse error) it must fail with. */
const NEGATIVE: Record<string, RegExp> = {
  "extra-attribute.mdoc": /chart-unknown-attribute/,
  "class-attribute.mdoc": /chart-unknown-attribute/,
  "style-attribute.mdoc": /chart-unknown-attribute/,
  "url-attribute.mdoc": /chart-unknown-attribute/,
  "value-1e999.mdoc": /chart-number/,
  "value-1e999-literal.mdoc": /parse-error/,
  "value-nan.mdoc": /chart-number/,
  "value-nan-literal.mdoc": /parse-error/,
  "label-61-characters.mdoc": /chart-label/,
  "nested-content.mdoc": /chart-children|tag-selfclosing-has-children/,
  "points-13.mdoc": /chart-points/,
  "series-3.mdoc": /chart-series/,
  "series-extra-key.mdoc": /chart-unknown-attribute/,
};
const POSITIVE = ["valid.mdoc", "valid-two-series.mdoc", "script-label.mdoc"];

describe("V1-54 strict chart tag schema", () => {
  it("V1-54 / F3-39 the allowlist is exactly callout and chart, in the renderer too", () => {
    expect(allowedTagNames).toEqual(["callout", "chart"]);
    expect(Object.keys(markdocConfig.tags ?? {}).sort()).toEqual(["callout", "chart"]);
  });
  it("V1-54 every fixture in tests/fixtures/v1/chart/ has an expectation", () => {
    expect(readdirSync(DIR).sort()).toEqual([...Object.keys(NEGATIVE), ...POSITIVE].sort());
  });
  it.each(Object.entries(NEGATIVE))("V1-54 %s fails the real Markdoc validation", (name, rule) => {
    const problems = checkMarkdoc(read(name), name);
    expect(problems.length, name).toBeGreaterThan(0);
    expect(problems.map((p) => p.message).join("\n")).toMatch(rule);
  });
  it.each(POSITIVE)("V1-54 %s passes", (name) => {
    expect(checkMarkdoc(read(name), name)).toEqual([]);
  });
  it("V1-54 messages name the attribute and the rule", () => {
    const msg = checkMarkdoc(read("value-1e999.mdoc"))
      .map((p) => p.message)
      .join("\n");
    expect(msg).toMatch(/series\[0\]\.values\[1\]: "1e999" is not a finite number \[chart-number\]/);
    expect(
      checkMarkdoc(read("points-13.mdoc"))
        .map((p) => p.message)
        .join("\n"),
    ).toMatch(/categories\[12\]: 13 points; at most 12/);
  });
  it("V1-54 boundaries: a 60-character label and 12 points pass; Infinity and -0 behave", () => {
    const base = {
      title: "x".repeat(CHART_LIMITS.label),
      units: "u",
      source: "s",
      categories: Array.from({ length: 12 }, (_, i) => `P${i}`),
      series: [{ name: "A", values: Array.from({ length: 12 }, () => -0) }],
    };
    expect(chartProblems(base)).toEqual([]);
    const inf = { ...base, series: [{ name: "A", values: [...Array.from({ length: 11 }, () => 1), Infinity] }] };
    expect(chartProblems(inf).map((p) => p.rule)).toEqual(["chart-number"]);
  });
  it("V1-55 a script label is valid content and reaches the renderer as a plain string", () => {
    const [tag] = chartTags(read("script-label.mdoc"));
    expect(tag?.attributes["title"]).toBe("<script>alert(1)</script>");
  });
});
