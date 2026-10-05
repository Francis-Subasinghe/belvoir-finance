/**
 * V1-05 to V1-14, V1-17, V1-38 (Aegis's SVG check, D-4): every negative fixture
 * in tests/fixtures/v1/svg/ fails the real check (`checkSvg`) with its rule, the
 * positive set passes, and every committed SVG passes.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_ELEMENTS,
  checkSvg,
  pageIdCollisions,
  svgLocationProblems,
  type SvgCheckOptions,
  type SvgRule,
} from "../helpers/svg-check";
import { tokenHexValues } from "../helpers/v1-assets";

const DIR = "tests/fixtures/v1/svg";
const read = (n: string) => readFileSync(join(DIR, n), "utf8");
const rules = (n: string, o: Partial<SvgCheckOptions> = {}) => checkSvg(read(n), { file: n, ...o }).map((p) => p.rule);

/** fixture -> [V1 id, extra options] */
const NEGATIVE: Record<string, [SvgRule, Partial<SvgCheckOptions>?]> = {
  "doctype-entity.svg": ["V1-05"],
  "cdata.svg": ["V1-05"],
  "processing-instruction.svg": ["V1-05"],
  "not-well-formed.svg": ["V1-05"],
  "script.svg": ["V1-06"],
  "foreign-object.svg": ["V1-06"],
  "image-data.svg": ["V1-06"],
  "style-import.svg": ["V1-06"],
  "set-href.svg": ["V1-06"],
  "textpath.svg": ["V1-06"],
  "onload-uppercase.svg": ["V1-07"],
  "use-external-href.svg": ["V1-08"],
  "xlink-javascript.svg": ["V1-08"],
  "path-style-url.svg": ["V1-08"],
  "fill-url-https.svg": ["V1-09"],
  "xmlns-evil.svg": ["V1-09"],
  "id-without-prefix.svg": ["V1-10", { idPrefix: "hero-" }],
  "over-cap-hero.svg": ["V1-11", { kind: "hero" }],
  "literal-fill.svg": ["V1-14", { asset: "inline" }],
  "served-non-token.svg": ["V1-14", { asset: "served" }],
  "text-in-decorative.svg": ["V1-17", { asset: "inline", decorative: true }],
  "comment-and-metadata.svg": ["V1-38", { asset: "inline" }],
};

describe("V1-05 to V1-38 SVG check: negative fixtures", () => {
  it("V1-13 every fixture file in tests/fixtures/v1/svg/ has an expectation (and vice versa)", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith(".svg"));
    expect(files.sort()).toEqual(Object.keys(NEGATIVE).sort());
  });
  it.each(Object.entries(NEGATIVE).map(([f, [id, o]]) => [`${id} ${f} fails`, f, id, o ?? {}] as const))(
    "%s",
    (_t, file, id, o) => {
      const tokenColours = o.asset === "served" ? tokenHexValues() : undefined;
      expect(rules(file, { ...o, tokenColours })).toContain(id);
    },
  );
  it("V1-07 any case of on* fails, not just ONLOAD", () => {
    for (const a of ["onclick", "OnFocus", "onBegin"])
      expect(checkSvg(`<svg ${a}="x"/>`, { file: a }).map((p) => p.rule)).toContain("V1-07");
  });
  it("V1-08 href on anything but <use> fails, and <use> with a #fragment passes", () => {
    expect(checkSvg('<svg><a href="#x"/></svg>', { file: "a" }).map((p) => p.rule)).toContain("V1-08");
    expect(checkSvg('<svg><rect href="#x"/></svg>', { file: "r" }).map((p) => p.rule)).toContain("V1-08");
    expect(checkSvg('<svg><use href="#ok-1"/></svg>', { file: "u" })).toEqual([]);
  });
  it("V1-09 the xmlns exemption is exact: a wrong value or another prefix fails", () => {
    expect(checkSvg('<svg xmlns="http://www.w3.org/2000/svg"/>', { file: "ok" })).toEqual([]);
    expect(checkSvg('<svg xmlns="https://www.w3.org/2000/svg"/>', { file: "s" }).map((p) => p.rule)).toContain("V1-09");
    expect(
      checkSvg('<svg xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:foo="http://www.w3.org/1999/xlink"/>', {
        file: "x",
      }).map((p) => p.rule),
    ).toContain("V1-09");
    for (const v of ["javascript:alert(1)", "data:x", "//evil.example/x", "HTTP://x", "url(#a) url(x.svg)"])
      expect(
        checkSvg(`<svg><rect fill="${v}"/></svg>`, { file: v }).map((p) => p.rule),
        v,
      ).toContain("V1-09");
  });
  it("V1-10 two inline SVGs on one page defining the same id fail", () => {
    expect(pageIdCollisions(read("id-collision.html"))).toEqual(["grad"]);
    expect(pageIdCollisions('<svg><g id="a-1"/></svg><svg><g id="b-1"/></svg>')).toEqual([]);
  });
  it("V1-12 an SVG outside src/assets/ fails; public/favicon.svg is the named exception", () => {
    expect(svgLocationProblems(["src/components/logo.svg", "public/x.svg"]).map((p) => p.file)).toEqual([
      "src/components/logo.svg",
      "public/x.svg",
    ]);
    expect(svgLocationProblems(["src/assets/icons/a.svg", "public/favicon.svg"])).toEqual([]);
  });
  it("V1-06 the allowlist is exactly Aegis's list (A-1: text and tspan in, textPath out)", () => {
    expect(ALLOWED_ELEMENTS).toEqual([
      "svg",
      "g",
      "defs",
      "title",
      "desc",
      "path",
      "rect",
      "circle",
      "ellipse",
      "line",
      "polyline",
      "polygon",
      "linearGradient",
      "radialGradient",
      "stop",
      "clipPath",
      "mask",
      "pattern",
      "symbol",
      "use",
      "text",
      "tspan",
    ]);
  });
});

describe("V1-05 to V1-38 SVG check: positive set and committed files", () => {
  it("V1-13 the positive fixtures pass every rule", () => {
    for (const f of readdirSync(join(DIR, "positive")))
      expect(checkSvg(read(`positive/${f}`), { file: f, idPrefix: "fx-" }), f).toEqual([]);
  });
  it("V1-12 every committed SVG is under src/assets/ or is public/favicon.svg (fixtures aside)", () => {
    const tracked = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "*.svg"], { encoding: "utf8" })
      .split("\n")
      .filter((p) => p && !p.startsWith("tests/fixtures/"));
    expect(tracked).toContain("public/favicon.svg");
    expect(svgLocationProblems(tracked)).toEqual([]);
  });
  it("V1-12 / V1-14 public/favicon.svg passes rules 1 to 6, and its literal colours are F2 tokens", () => {
    const f = "public/favicon.svg";
    expect(
      checkSvg(readFileSync(f, "utf8"), { file: f, kind: "icon", asset: "served", tokenColours: tokenHexValues() }),
    ).toEqual([]);
  });
});
