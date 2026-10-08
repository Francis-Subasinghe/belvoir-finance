/**
 * Lighthouse CI config generation (tools/lighthouse/assertions.ts, used by
 * lighthouserc.cjs). Builds a fixture site in a temp folder and checks the
 * demo classifier, the per-page assertions and the generated assertMatrix.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  HOST,
  ORIGIN,
  PORT,
  SEO_EXEMPT_PATHS,
  buildAssertMatrix,
  commentRanges,
  headOf,
  isDemoHtml,
  pageAssertions,
  seoExemption,
  listPages,
  readBudgets,
  type MatrixEntry,
  strictlyBelow,
} from "../../tools/lighthouse/assertions.ts";
import { portInUse } from "../../tools/lighthouse/preflight.ts";

const budgets = readBudgets("tools/lighthouse/budgets.json");
const url = (path: string) => `${ORIGIN}/belvoir-finance/${path}`;
const page = (head: string) =>
  `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">${head}<title>t</title></head><body><main><h1>t</h1></main></body></html>`;
const DEMO = '<meta name="belvoir-demo" content="true">';
const NOINDEX = '<meta name="robots" content="noindex, nofollow">';

const FIXTURE: Record<string, string> = {
  "index.html": page('<meta name="robots" content="index, follow">'),
  "noindex-only/index.html": page(NOINDEX),
  "stories/demo-story/index.html": page(NOINDEX + DEMO),
  "stories/demo-reordered/index.html": page(`<META content='true' NAME=belvoir-demo>`),
  "stories/marker-false/index.html": page('<meta name="belvoir-demo" content="false">'),
  "stories/other-meta/index.html": page('<meta name="belvoir-demo-x" content="true"><meta name="x" content="true">'),
  "tools/cash-vs-profit/index.html": page(""),
  "404.html": page(NOINDEX),
  "404x.html": page(NOINDEX),
  "foo/404.html": page(NOINDEX),
};

let dist = "";
beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), "lhci-fixture-"));
  for (const [rel, html] of Object.entries(FIXTURE)) {
    mkdirSync(dirname(join(dist, rel)), { recursive: true });
    writeFileSync(join(dist, rel), html);
  }
});
afterAll(() => rmSync(dist, { recursive: true, force: true }));

/** The single matrix entry whose pattern matches this URL (fails if 0 or several). */
function entryFor(matrix: MatrixEntry[], u: string): MatrixEntry {
  const hits = matrix.filter((m) => new RegExp(m.matchingUrlPattern).test(u));
  expect(hits, u).toHaveLength(1);
  return hits[0] as MatrixEntry;
}

describe("demo marker must be in the document head", () => {
  const body = (b: string) =>
    `<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body>${b}</body></html>`;

  it("marker in the head is demo", () => {
    expect(isDemoHtml(`<html><HEAD lang="x">${DEMO}</Head ><body></body></html>`)).toBe(true);
  });

  it("marker only in the body is not demo", () => {
    expect(isDemoHtml(body(DEMO))).toBe(false);
  });

  it("a fake <head> later in the body does not count (first <head> to first </head> only)", () => {
    expect(isDemoHtml(body(`<p>Example: <head>${DEMO}</head></p>`))).toBe(false);
    expect(isDemoHtml(body(`<pre>&lt;head&gt;${DEMO}&lt;/head&gt;</pre>`))).toBe(false);
    expect(isDemoHtml(body(`<template><head>${DEMO}</head></template>`))).toBe(false);
  });

  it("HTML comments are ignored when finding the head", () => {
    const fake = "<!-- <head><meta name=belvoir-demo content=true></head> -->";
    expect(isDemoHtml(`<!doctype html>${fake}<html><head><title>t</title></head><body></body></html>`)).toBe(false);
    expect(isDemoHtml(`<html><head>${fake}<title>t</title></head></html>`)).toBe(false);
    // a commented-out </head> does not end the real head early
    expect(isDemoHtml(`<html><head><!-- </head> --><title>t</title>${DEMO}</head></html>`)).toBe(true);
    expect(commentRanges("a<!--b-->c<!--d")).toEqual([
      [1, 9],
      [10, 15],
    ]);
    // an unclosed comment hides the rest of the document
    expect(isDemoHtml(`<html><!-- <head>${DEMO}</head></html>`)).toBe(false);
  });

  it("no head element, or an unclosed head, is not demo (fail-safe)", () => {
    expect(isDemoHtml(`<html><body>${DEMO}</body></html>`)).toBe(false);
    expect(isDemoHtml(`<html><header>${DEMO}</header></html>`)).toBe(false);
    expect(isDemoHtml(`<html><head>${DEMO}<body></body></html>`)).toBe(false);
    expect(headOf("<html><header>x</header></html>")).toBeUndefined();
  });
});

describe("strict budget limits", () => {
  it("strictlyBelow(x) is the largest double below x, so v <= strictlyBelow(x) iff v < x", () => {
    for (const limit of [2500, 0.1, 200]) {
      const max = strictlyBelow(limit);
      expect(max).toBeLessThan(limit);
      expect(limit <= max).toBe(false); // exactly at the limit fails
      expect(max <= max).toBe(true);
      // no double lies between max and limit: the midpoint rounds to one of them
      const mid = max + (limit - max) / 2;
      expect(mid === max || mid === limit).toBe(true);
    }
    expect(2499.9 <= strictlyBelow(2500)).toBe(true);
    expect(0.0999 <= strictlyBelow(0.1)).toBe(true);
  });

  it("rejects non-positive or non-finite limits", () => {
    expect(() => strictlyBelow(0)).toThrow();
    expect(() => strictlyBelow(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("preview port", () => {
  it("uses a dedicated 127.0.0.1 port, not the dev server's 4321", () => {
    expect(HOST).toBe("127.0.0.1");
    expect(PORT).toBe(4329);
    expect(ORIGIN).toBe("http://127.0.0.1:4329");
  });

  it("preflight detects a port that is already in use, and a free one", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen({ host: "127.0.0.1", port: 0 }, resolve));
    const { port } = server.address() as AddressInfo;
    expect(await portInUse("127.0.0.1", port)).toBe(true);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect(await portInUse("127.0.0.1", port)).toBe(false);
  });
});

describe("demo marker detection", () => {
  it('matches only <meta name="belvoir-demo" content="true">', () => {
    expect(isDemoHtml(page(DEMO))).toBe(true);
    expect(isDemoHtml(page(`<meta content="true" name="belvoir-demo" />`))).toBe(true);
    expect(isDemoHtml(page('<meta name="belvoir-demo" content="false">'))).toBe(false);
    expect(isDemoHtml(page('<meta name="belvoir-demo" content="TRUE">'))).toBe(false);
    expect(isDemoHtml(page('<meta name="belvoir-demo">'))).toBe(false);
    expect(isDemoHtml(page('<meta name="belvoir-demo-x" content="true">'))).toBe(false);
    expect(isDemoHtml(page('<meta property="belvoir-demo" content="true">'))).toBe(false);
    expect(isDemoHtml(page('<div data-name="belvoir-demo" content="true"></div>'))).toBe(false);
  });

  it("noindex alone does not make a page demo", () => {
    expect(isDemoHtml(page(NOINDEX))).toBe(false);
  });
});

describe("listPages", () => {
  it("lists every index.html plus the root 404.html, with its demo flag", () => {
    expect(listPages(dist)).toEqual([
      { url: url("404.html"), demo: false },
      { url: url(""), demo: false },
      { url: url("noindex-only/"), demo: false },
      { url: url("stories/demo-reordered/"), demo: true },
      { url: url("stories/demo-story/"), demo: true },
      { url: url("stories/marker-false/"), demo: false },
      { url: url("stories/other-meta/"), demo: false },
      { url: url("tools/cash-vs-profit/"), demo: false },
    ]);
  });

  it("fails loudly on an empty build", () => {
    const empty = mkdtempSync(join(tmpdir(), "lhci-empty-"));
    try {
      expect(() => listPages(empty)).toThrow(/no pages found/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe("SEO exemption for the 404 page", () => {
  const ALL = [
    "categories:performance",
    "categories:accessibility",
    "categories:best-practices",
    "categories:seo",
    "largest-contentful-paint",
    "cumulative-layout-shift",
    "total-blocking-time",
    "resource-summary:script:size",
    "resource-summary:image:size",
  ].sort();
  const keys = (u: string, demo = false) => Object.keys(pageAssertions(budgets, { url: u, demo }, "warn")).sort();

  it("is the 404 plus exactly the Q-10 placeholder pages, by exact path", () => {
    expect(SEO_EXEMPT_PATHS).toEqual(["/404.html", "/about/", "/contact/", "/privacy/", "/cookies/", "/terms/"]);
  });

  it("F3-47 a placeholder page skips SEO only (no marker needed); a near-miss path does not", () => {
    const u = url("about/");
    expect(seoExemption({ url: u, demo: false })).toBe("placeholder");
    expect(keys(u)).toEqual(ALL.filter((k) => k !== "categories:seo"));
    for (const near of [url("about"), url("about/team/"), url("explore/"), url("sources/"), `${ORIGIN}/about/`])
      expect(seoExemption({ url: near, demo: false }), near).toBeUndefined();
  });

  it("/belvoir-finance/404.html skips SEO only, and keeps the editorial JS budget", () => {
    const u = url("404.html");
    expect(seoExemption({ url: u, demo: false })).toBe("404");
    expect(keys(u)).toEqual(ALL.filter((k) => k !== "categories:seo"));
    expect(pageAssertions(budgets, { url: u, demo: false }, "warn")["resource-summary:script:size"]?.[1]).toEqual({
      maxNumericValue: 51200,
      aggregationMethod: "median",
    });
  });

  it.each([
    ["the home page", url("")],
    ["a non-demo noindex page", url("noindex-only/")],
    ["/404x.html", url("404x.html")],
    ["/foo/404.html", url("foo/404.html")],
    ["/404.html/", url("404.html/")],
    ["/404.html outside the base path", `${ORIGIN}/404.html`],
  ])("%s is still asserted for SEO", (_name, u) => {
    expect(seoExemption({ url: u, demo: false })).toBeUndefined();
    expect(keys(u)).toEqual(ALL);
  });

  it("the built 404 page lands in an anchored matrix entry without SEO", () => {
    const matrix = buildAssertMatrix(budgets, listPages(dist), "warn");
    const a = entryFor(matrix, url("404.html")).assertions;
    expect(a["categories:seo"]).toBeUndefined();
    expect(Object.keys(a)).toHaveLength(ALL.length - 1);
    expect(entryFor(matrix, url("noindex-only/")).assertions["categories:seo"]).toBeDefined();
  });
});

describe("generated assertMatrix", () => {
  const ALL_BUT_SEO = [
    "categories:performance",
    "categories:accessibility",
    "categories:best-practices",
    "largest-contentful-paint",
    "cumulative-layout-shift",
    "total-blocking-time",
    "resource-summary:script:size",
    "resource-summary:image:size",
  ];
  let matrix: MatrixEntry[] = [];
  beforeAll(() => {
    matrix = buildAssertMatrix(budgets, listPages(dist), "warn");
  });

  it("every listed URL matches exactly one entry, and nothing else matches", () => {
    for (const p of listPages(dist)) entryFor(matrix, p.url);
    for (const u of [
      url("stories/demo-story/extra/"),
      url("stories/demo-story"),
      `x${url("")}`,
      url("404x.html"),
      url("foo/404.html"),
      url("404.html/"),
    ]) {
      expect(
        matrix.filter((m) => new RegExp(m.matchingUrlPattern).test(u)),
        u,
      ).toEqual([]);
    }
  });

  it("a non-demo page with noindex is still asserted for SEO", () => {
    const a = entryFor(matrix, url("noindex-only/")).assertions;
    expect(a["categories:seo"]).toEqual(["warn", { minScore: 0.9, aggregationMethod: "median" }]);
    expect(Object.keys(a).sort()).toEqual([...ALL_BUT_SEO, "categories:seo"].sort());
  });

  it("a demo page skips only the SEO category", () => {
    for (const u of [url("stories/demo-story/"), url("stories/demo-reordered/")]) {
      const a = entryFor(matrix, u).assertions;
      expect(a["categories:seo"], u).toBeUndefined();
      expect(Object.keys(a).sort(), u).toEqual([...ALL_BUT_SEO].sort());
    }
  });

  it("decoy markers are not demo", () => {
    for (const u of [url("stories/marker-false/"), url("stories/other-meta/")]) {
      expect(entryFor(matrix, u).assertions["categories:seo"], u).toBeDefined();
    }
  });

  it("matches every TEST_STRATEGY budget row, with median aggregation", () => {
    const a = entryFor(matrix, url("")).assertions;
    for (const c of ["performance", "accessibility", "best-practices", "seo"]) {
      expect(a[`categories:${c}`]).toEqual(["warn", { minScore: 0.9, aggregationMethod: "median" }]);
    }
    // "< limit" rows are asserted as the largest double below the limit (LHCI checks "<=").
    expect(a["largest-contentful-paint"]).toEqual([
      "warn",
      { maxNumericValue: strictlyBelow(2500), aggregationMethod: "median" },
    ]);
    expect(a["cumulative-layout-shift"]).toEqual([
      "warn",
      { maxNumericValue: strictlyBelow(0.1), aggregationMethod: "median" },
    ]);
    expect(a["total-blocking-time"]).toEqual([
      "warn",
      { maxNumericValue: strictlyBelow(200), aggregationMethod: "median" },
    ]);
    expect(a["resource-summary:script:size"]).toEqual([
      "warn",
      { maxNumericValue: 51200, aggregationMethod: "median" },
    ]);
  });

  it("the tool page gets a 0 KB JS budget in F3 (static shell; F4 raises it to 120 KB); editorial pages get 50 KB", () => {
    const tool = entryFor(matrix, url("tools/cash-vs-profit/")).assertions;
    expect(tool["resource-summary:script:size"]?.[1].maxNumericValue).toBe(0);
    const story = entryFor(matrix, url("stories/demo-story/")).assertions;
    expect(story["resource-summary:script:size"]?.[1].maxNumericValue).toBe(51200);
  });

  it("groups pages by identical assertions and anchors every pattern", () => {
    // non-demo editorial, demo editorial, tool page
    expect(matrix).toHaveLength(3);
    for (const m of matrix) expect(m.matchingUrlPattern).toMatch(/^\^\(\?:.*\)\$$/);
  });

  it("blocking mode only changes the level", () => {
    const blocking = buildAssertMatrix(budgets, listPages(dist), "error");
    expect(blocking.map((m) => m.matchingUrlPattern)).toEqual(matrix.map((m) => m.matchingUrlPattern));
    for (const m of blocking) for (const [level] of Object.values(m.assertions)) expect(level).toBe("error");
  });
});

describe("lighthouserc.cjs: LHCI_BLOCKING sets the assertion level", () => {
  const RC = resolve("tools/lighthouse/lighthouserc.cjs");

  it('has the exact LEVEL line: only the string "true" means error', () => {
    const lines = readFileSync(RC, "utf8").split("\n");
    expect(lines.filter((l) => /\bLEVEL\b/.test(l) && l.startsWith("const "))).toEqual([
      'const LEVEL = process.env.LHCI_BLOCKING === "true" ? "error" : "warn";',
    ]);
    expect(lines).toContain("    assert: { assertMatrix: buildAssertMatrix(budgets, pages, LEVEL) },");
  });

  /** Loads the real config in a child Node (cwd has dist-lhci/ = the fixture) and returns every level. */
  function levels(blocking: string | undefined): string[] {
    const cwd = mkdtempSync(join(tmpdir(), "lhci-rc-"));
    try {
      symlinkSync(dist, join(cwd, "dist-lhci"), "dir");
      const env = { ...process.env };
      delete env.LHCI_BLOCKING;
      if (blocking !== undefined) env.LHCI_BLOCKING = blocking;
      const r = spawnSync(
        process.execPath,
        [
          "-e",
          "const m = require(process.argv[1]).ci.assert.assertMatrix;" +
            "process.stdout.write(JSON.stringify(m.flatMap((e) => Object.values(e.assertions).map((a) => a[0]))));",
          RC,
        ],
        { cwd, env, encoding: "utf8" },
      );
      expect(r.status, r.stderr).toBe(0);
      return JSON.parse(r.stdout) as string[];
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }

  it('LHCI_BLOCKING=true makes every assertion "error"', () => {
    const all = levels("true");
    expect(all.length).toBeGreaterThan(20);
    expect(new Set(all)).toEqual(new Set(["error"]));
  });

  it.each([["false"], [undefined], ["TRUE"], ["1"], [""]])('LHCI_BLOCKING=%s makes every assertion "warn"', (v) => {
    expect(new Set(levels(v))).toEqual(new Set(["warn"]));
  });
});

describe("V1-33 image budget", () => {
  it("V1-33 budgets.json pins 100 KB of images per URL, asserted on every page", () => {
    expect(budgets.imageTransferBytes).toBe(100 * 1024);
    for (const p of listPages(dist))
      expect(pageAssertions(budgets, p, "error")["resource-summary:image:size"], p.url).toEqual([
        "error",
        { maxNumericValue: 102400, aggregationMethod: "median" },
      ]);
  });
});
