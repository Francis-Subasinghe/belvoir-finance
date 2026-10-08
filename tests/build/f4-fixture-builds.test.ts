/**
 * F4 checks that need their own build, on temporary copies of the repo
 * (tests/helpers/fixture-build.ts):
 * - F4-30: with a script under Vite's 4 KB inline default, a copy whose
 *   astro.config.mjs lacks `assetsInlineLimit: 0` inlines it and the real
 *   dist check (scriptPolicyProblems) fails; with the setting it stays an
 *   external module. (The real 6.5 KB bundle is over 4 KB either way.)
 * - F4-54: two builds of the committed content under different faked dates
 *   and time zones are byte-identical, including the tool's .js file, its
 *   hashed name and the pre-rendered worked example.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scriptPolicyProblems, TOOL_PAGE, workedExampleProblems } from "../helpers/f4-dist";
import { astroBuild, FAKE_CLOCK, hashTree, makeSite, type Site, walkFiles } from "../helpers/fixture-build";

const T = 180_000;

function pagesOf(site: Site) {
  const files = walkFiles(site.dist).map((f) => relative(site.dist, f).replace(/\\/g, "/"));
  return {
    pages: files
      .filter((f) => f.endsWith(".html"))
      .map((page) => ({ page, html: readFileSync(join(site.dist, page), "utf8") })),
    js: files.filter((f) => /\.m?js$/.test(f)),
  };
}

/** A copy of the repo whose explorer script is tiny (under Vite's 4 KB inline default). */
function tinyScriptSite(keepSetting: boolean): Site {
  const site = makeSite(["content"]);
  writeFileSync(
    join(site.dir, "src/scripts/cash-vs-profit.ts"),
    'document.querySelector("[data-cvp]")?.setAttribute("data-x", "1");\n',
  );
  if (!keepSetting) {
    const config = join(site.dir, "astro.config.mjs");
    const text = readFileSync(config, "utf8");
    const without = text.replace(/\n\s*assetsInlineLimit: 0,/, "");
    if (without === text) throw new Error("assetsInlineLimit: 0 not found in astro.config.mjs");
    writeFileSync(config, without);
  }
  const r = astroBuild(site);
  if (r.status !== 0) throw new Error(`fixture build failed:\n${r.output}`);
  return site;
}

describe("F4-30 assetsInlineLimit: 0 is what keeps a small script external", () => {
  let without: Site;
  let withSetting: Site;
  beforeAll(() => {
    without = tinyScriptSite(false);
    withSetting = tinyScriptSite(true);
  }, T * 2);
  afterAll(() => {
    without?.cleanup();
    withSetting?.cleanup();
  });

  it("F4-30 (M-27) without the setting the small script is inlined, and the real dist check fails", () => {
    const { pages, js } = pagesOf(without);
    const tool = pages.find((p) => p.page === TOOL_PAGE)?.html ?? "";
    expect(tool).toMatch(/<script type="module">[^<]+<\/script>/);
    expect(js).toEqual([]);
    expect(scriptPolicyProblems(pages, js).join("\n")).toContain('needs exactly one <script type="module" src=');
  });

  it("F4-30 with the setting the same small script is an external module and the check passes", () => {
    const { pages, js } = pagesOf(withSetting);
    expect(js).toHaveLength(1);
    expect(scriptPolicyProblems(pages, js)).toEqual([]);
  });
});

describe("F4-54 reproducible build with the explorer", () => {
  it(
    "F4-54 two builds faked to different dates and zones are byte-identical, tool .js and worked example included",
    () => {
      const runs = [
        { FAKE_NOW: "2026-01-01T00:00:00Z", TZ: "UTC" },
        { FAKE_NOW: "2031-07-15T12:00:00Z", TZ: "Pacific/Kiritimati" },
      ];
      const results = runs.map((env) => {
        const site = makeSite(["content"]);
        try {
          const r = astroBuild(site, env, ["--import", FAKE_CLOCK]);
          expect(r.status, r.output).toBe(0);
          const { pages, js } = pagesOf(site);
          expect(js).toHaveLength(1);
          expect(workedExampleProblems(pages.find((p) => p.page === TOOL_PAGE)?.html ?? "")).toEqual([]);
          return hashTree(site.dist);
        } finally {
          site.cleanup();
        }
      });
      const [a, b] = results;
      expect(Object.keys(a ?? {}).some((f) => /^_astro[\\/].+\.js$/.test(f))).toBe(true);
      expect(b).toEqual(a);
    },
    T * 2,
  );
});
