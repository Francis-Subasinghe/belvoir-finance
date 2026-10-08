/**
 * F4 assertions on the real build in dist/ (run after `npm run build`): the
 * one external module script (F4-30, F4-46), the pre-rendered worked example
 * (F4-06), the controls (F4-16, F4-37), the results markup (F4-18, F4-21,
 * F4-35, F4-41), the defaults (F4-39), the topic-card icon (F4-53) and the
 * script and CSS sizes (F4-45, F4-49). Each check is a pure function in
 * tests/helpers/f4-dist.ts, so the negative fixtures in tests/fixtures/f4/html/
 * fail the same code.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { parse } from "yaml";
import { beforeAll, describe, expect, it } from "vitest";
import { scriptProblems } from "../helpers/f4-scan";
import {
  controlProblems,
  defaultsProblems,
  gzipTotal,
  resultsMarkupProblems,
  scriptPolicyProblems,
  SHARED_CSS_ALLOWANCE,
  SHARED_CSS_GZIP_5FDC80E,
  TOOL_JS_MAX_GZIP,
  TOOL_JS_TARGET_GZIP,
  TOOL_PAGE,
  topicToolIconProblems,
  workedExampleProblems,
} from "../helpers/f4-dist";
import { moduleImports } from "../helpers/f4-dist";
import { nonJsonLdScriptTags } from "../helpers/html";

const FX = "tests/fixtures/f4/html";
const read = (p: string) => readFileSync(p, "utf8");
const fx = (n: string) => read(join(FX, n));

let pages: { page: string; html: string }[] = [];
let jsFiles: string[] = [];
const tool = () => pages.find((p) => p.page === TOOL_PAGE)?.html ?? "";

beforeAll(async () => {
  const { readdirSync, statSync } = await import("node:fs");
  const { relative } = await import("node:path");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  const files = walk("dist");
  const rel = (f: string) => relative("dist", f).replace(/\\/g, "/");
  pages = files.filter((f) => f.endsWith(".html")).map((f) => ({ page: rel(f), html: read(f) }));
  jsFiles = files.filter((f) => /\.m?js$/.test(f)).map(rel);
});

describe("F4-30 / F4-46 one external module script, only on the tool page", () => {
  it("F4-30 / F4-46 dist: exactly one module on the tool page, no script, modulepreload or .js anywhere else, no orphans", () => {
    expect(pages.length).toBeGreaterThan(15);
    expect(scriptPolicyProblems(pages, jsFiles)).toEqual([]);
  });

  it.each([
    ["F4-46 a non-tool page with a script", "non-tool-script.html", "stories/x/index.html"],
    ["F4-46 a modulepreload on a non-tool page", "non-tool-modulepreload.html", "stories/x/index.html"],
    ["F4-30 an inlined tool script (the build without assetsInlineLimit: 0)", "tool-inline-script.html", TOOL_PAGE],
  ])("%s fails the same check", (_name, file, page) => {
    expect(scriptPolicyProblems([{ page, html: fx(file) }], [])).not.toEqual([]);
  });

  it("F4-46 an orphan .js file fails the same check", () => {
    expect(scriptPolicyProblems(pages, [...jsFiles, "orphan.js"])).toEqual([
      `orphan .js: orphan.js is not loaded by ${TOOL_PAGE}`,
    ]);
  });

  it("F4-30 JSON-LD on a story page still passes the same check", () => {
    const story = pages.find((p) => p.page.startsWith("stories/") && p.page !== "stories/index.html");
    expect(nonJsonLdScriptTags(story?.html ?? "")).toEqual([]);
  });

  it("F4-30 / F4-32 / F4-33 the emitted bundle has no banned API, HTML sink or style write, and no further imports", () => {
    expect(jsFiles).toHaveLength(1);
    const js = read(join("dist", jsFiles[0] ?? ""));
    expect(scriptProblems(jsFiles[0] ?? "", js)).toEqual([]);
    expect(moduleImports(js)).toEqual([]);
  });
});

describe("F4-45 script size", () => {
  it("F4-45 the tool page's JavaScript is under 120 KB gzip, and the actual size is reported", () => {
    const files = jsFiles.map((f) => readFileSync(join("dist", f)));
    const gz = gzipTotal(files);
    console.info(
      `F4-45: ${jsFiles.length} JS file(s), ${files.reduce((n, b) => n + b.length, 0)} bytes raw, ${gz} bytes gzip`,
    );
    expect(gz).toBeLessThanOrEqual(TOOL_JS_MAX_GZIP);
    expect(gz).toBeLessThanOrEqual(TOOL_JS_TARGET_GZIP);
  });

  it("F4-45 a padded bundle over 122,880 bytes gzip fails the same check", () => {
    // Deterministic incompressible bytes (xorshift32), so the fixture needn't be committed.
    let x = 0x0f4045;
    const padded = Buffer.alloc(130_000);
    for (let i = 0; i < padded.length; i++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      padded[i] = x & 0xff;
    }
    expect(gzipTotal([padded])).toBeGreaterThan(TOOL_JS_MAX_GZIP);
  });
});

describe("F4-49 shared stylesheet size", () => {
  it("F4-49 the shared stylesheet grew by at most 1 KB gzip over 5fdc80e, and the size is reported", () => {
    const css =
      jsFiles &&
      readFileSync(join("dist", pages[0]?.html.match(/href="\/belvoir-finance\/(_astro\/[^"]+\.css)"/)?.[1] ?? ""));
    const gz = gzipSync(css).length;
    console.info(
      `F4-49: shared CSS ${css.length} bytes raw, ${gz} bytes gzip (5fdc80e was ${SHARED_CSS_GZIP_5FDC80E})`,
    );
    expect(gz - SHARED_CSS_GZIP_5FDC80E).toBeLessThanOrEqual(SHARED_CSS_ALLOWANCE);
    expect(gz - SHARED_CSS_GZIP_5FDC80E).toBeGreaterThan(0);
  });
});

describe("F4 explorer markup", () => {
  it("F4-06 the pre-rendered worked example equals S3-01, and the negative fixture fails", () => {
    expect(workedExampleProblems(tool())).toEqual([]);
    expect(workedExampleProblems(fx("worked-example-wrong.html"))).not.toEqual([]);
  });
  it("F4-16 / F4-37 labels, hints and input attributes; no form, no input name, buttons type=button; the fixtures fail", () => {
    expect(controlProblems(tool())).toEqual([]);
    expect(controlProblems(fx("form-wrapper.html")).join(" ")).toContain("<form>");
    expect(controlProblems(fx("input-with-name.html")).join(" ")).toContain("has a name");
  });
  it("F4-18 / F4-21 / F4-35 / F4-36 / F4-41 live region, table, disabled fieldset, note and its reserve, disclaimer; the fixtures fail", () => {
    expect(resultsMarkupProblems(tool())).toEqual([]);
    expect(resultsMarkupProblems(fx("no-disclaimer.html")).join(" ")).toContain("disclaimer");
    expect(resultsMarkupProblems(fx("live-region-by-script.html")).join(" ")).toContain("live region");
    expect(resultsMarkupProblems(fx("fieldset-enabled.html")).join(" ")).toContain("disabled");
    // F4-36: without the hidden copy, swapping the note can change its height.
    expect(resultsMarkupProblems(fx("note-no-reserve.html")).join(" ")).toContain("reserve");
  });
  it("F4-39 each input value and its assumption default equal DEFAULTS, and the F3 placeholder text is gone", () => {
    const entry = parse(read("content/tools/cash-vs-profit.yaml")) as {
      assumptions: { label: string; default: string }[];
      summary: string;
    };
    expect(defaultsProblems(tool(), entry.assumptions)).toEqual([]);
    const page = tool();
    expect(page).not.toContain("built in F4");
    expect(page).not.toContain("final values are set in F4");
  });
  it("F4-39 an assumption default that differs from DEFAULTS fails the same check", () => {
    const assumptions = [{ label: "Monthly sales", default: "£19,000" }];
    expect(defaultsProblems(tool(), assumptions).join(" ")).toContain("Monthly sales");
  });
  it("F4-40 the tool page keeps the demo marking: banner, noindex and the belvoir-demo marker", () => {
    const page = tool();
    expect(page).toContain('data-testid="demo-banner"');
    expect(page).toContain('name="robots" content="noindex, nofollow"');
    expect(page).toContain('name="belvoir-demo" content="true"');
  });
  it("F4-53 the topic tools card shows the tool icon before its link; the negative fixture fails", () => {
    const topic = pages.find((p) => p.page === "topics/understand-the-numbers/index.html")?.html ?? "";
    expect(topicToolIconProblems(topic)).toEqual([]);
    expect(topicToolIconProblems(fx("topic-card-ok.html"))).toEqual([]);
    expect(topicToolIconProblems(fx("topic-card-no-icon.html"))).not.toEqual([]);
  });
});
