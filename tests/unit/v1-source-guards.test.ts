/**
 * V1-04, V1-12, V1-36, V1-37, V1-40, V1-56: the source scans over the real
 * tree, and every negative fixture in tests/fixtures/v1/source/ failing the
 * same exported function.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { walkFiles } from "../helpers/design-scan";
import {
  APPROVED_FONT_FACES,
  contentSvgValueProblems,
  fontFaceProblems,
  lazyAboveFoldProblems,
  randomnessProblems,
  rasterFileProblems,
  rasterImgProblems,
  remoteProblems,
  svgInjectionProblems,
  type SourceProblem,
  walkAll,
} from "../helpers/v1-source-scan";

const DIR = "tests/fixtures/v1/source";
const read = (p: string) => readFileSync(p, "utf8");
const fx = (n: string) => ({ file: join(DIR, n), text: read(join(DIR, n)) });
const rules = (ps: SourceProblem[]) => ps.map((p) => p.rule);

/** Fixture → [rule, scan]. Every file in the directory must be listed. */
const NEGATIVE: Record<string, [SourceProblem["rule"], (f: string, t: string) => SourceProblem[]]> = {
  "remote-url.css": ["V1-04", remoteProblems],
  "import-protocol-relative.css": ["V1-04", remoteProblems],
  "import-local-unlisted.css": ["V1-04", remoteProblems],
  "remote-img.astro": ["V1-04", remoteProblems],
  "remote-svg-href.svg": ["V1-04", remoteProblems],
  "svg-raw-set-html.astro": ["V1-56", svgInjectionProblems],
  "svg-set-html.astro": ["V1-12", svgInjectionProblems],
  "content-svg-image.mdoc": ["V1-12", contentSvgValueProblems],
  "new-font-face.css": ["V1-36", (f, t) => fontFaceProblems(f, t)],
  "fallback-with-url.css": ["V1-36", (f, t) => fontFaceProblems(f, t)],
  "lazy-above-fold.html": ["V1-37", lazyAboveFoldProblems],
  "raster-img.html": ["V1-37", rasterImgProblems],
  "math-random.ts": ["V1-40", randomnessProblems],
  "random-uuid.ts": ["V1-40", randomnessProblems],
  "get-random-values.ts": ["V1-40", randomnessProblems],
  "new-date.ts": ["V1-40", randomnessProblems],
};

const tracked = (): string[] =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);

describe("V1 source guards: negative fixtures", () => {
  it("every fixture in tests/fixtures/v1/source/ has an expectation", () => {
    expect(readdirSync(DIR).sort()).toEqual(Object.keys(NEGATIVE).sort());
  });
  it.each(Object.entries(NEGATIVE).map(([n, [id, scan]]) => [`${id} ${n} fails`, n, id, scan] as const))(
    "%s",
    (_t, n, id, scan) => {
      const { file, text } = fx(n);
      expect(rules(scan(file, text))).toContain(id);
    },
  );
  it("V1-37 a PNG under src/assets/ fails (path fixture; PNGs are never committed)", () => {
    expect(rules(rasterFileProblems(["src/assets/hero.png", "public/x.JPG", "tests/visual/a.png"]))).toEqual([
      "V1-37",
      "V1-37",
    ]);
  });
  it("V1-40 a date with an argument and Date.UTC are deterministic and pass", () => {
    expect(randomnessProblems("x.ts", 'new Date("2026-10-02T00:00:00Z"); new Date(Date.UTC(2026, 0, 1));')).toEqual([]);
  });
  it("V1-04 namespace declarations, url(#id), relative paths and <a href> links pass", () => {
    expect(
      remoteProblems(
        "ok.svg",
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><path fill="url(#a)"/></svg>',
      ),
    ).toEqual([]);
    expect(remoteProblems("ok.css", ".a{background:url(./a.svg)} .b{mask:url(#m)}")).toEqual([]);
    expect(remoteProblems("ok.html", '<a href="https://example.invalid/report">Report</a>', true)).toEqual([]);
  });
});

const srcFiles = walkFiles("src", [".css", ".astro", ".ts", ".svg"]);
const publicFiles = walkAll("public");
const contentFiles = walkAll("content");

describe("V1 source guards: the real tree", () => {
  it("V1-04 src/, public/ and content/ load nothing from another origin", () => {
    const problems = [...srcFiles, ...publicFiles, ...contentFiles].flatMap((p) => remoteProblems(p, read(p)));
    expect(problems).toEqual([]);
    expect(srcFiles.length).toBeGreaterThan(20);
    expect(publicFiles).toContain("public/favicon.svg");
    expect(contentFiles.length).toBeGreaterThan(10);
  });
  it("V1-12 / V1-56 no ?raw SVG import and no set:html outside JsonLd.astro, anywhere under src/", () => {
    expect(srcFiles.flatMap((p) => svgInjectionProblems(p, read(p)))).toEqual([]);
  });
  it("V1-12 no content value or Keystatic default names an .svg", () => {
    expect(contentFiles.flatMap((p) => contentSvgValueProblems(p, read(p)))).toEqual([]);
  });
  it("V1-36 src/ declares only the Atlas-approved @font-face rules", () => {
    const css = srcFiles.filter((p) => p.endsWith(".css"));
    expect(css.flatMap((p) => fontFaceProblems(p, read(p)))).toEqual([]);
    expect(APPROVED_FONT_FACES).toHaveLength(10);
  });
  it("V1-37 no raster file under src/, public/ or content/ is committed", () => {
    expect(rasterFileProblems(tracked())).toEqual([]);
  });
  it("V1-40 src/ and scripts/ use no randomness or wall-clock dates", () => {
    const files = [...walkFiles("src", [".ts", ".astro", ".mjs"]), ...walkFiles("scripts", [".ts", ".mjs", ".js"])];
    expect(files.flatMap((p) => randomnessProblems(p, read(p)))).toEqual([]);
  });
});
