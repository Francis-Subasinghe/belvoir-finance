import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listCountProblems, skippedTestProblems } from "../../scripts/visual-tests";
import { expectedBaselinePaths, VISUAL_PROJECTS, VISUAL_SNAPSHOTS } from "../helpers/visual-pages";

describe("F3-41 visual suite can't be partial", () => {
  it("F3-41 no committed visual spec skips, narrows or inverts a test", () => {
    const specs = readdirSync("tests/visual").filter((f) => f.endsWith(".visual.ts"));
    expect(specs.sort()).toEqual(["gallery.visual.ts", "pages.visual.ts"]);
    for (const f of specs) expect(skippedTestProblems(f, readFileSync(`tests/visual/${f}`, "utf8"))).toEqual([]);
  });
  it("F3-41 negative: the skipped fixture is caught four times (skip, fixme, only, skip mode), not the comment", () => {
    const code = readFileSync("tests/fixtures/visual/skipped.visual.ts.fixture", "utf8");
    const problems = skippedTestProblems("skipped.visual.ts", code);
    expect(problems).toHaveLength(4);
    expect(problems.join("\n")).toMatch(/test\.skip.*test\.fixme.*test\.describe\.only.*mode: "skip"/s);
  });
  it("F3-41 the --list count check passes on a full list and fails on a short one", () => {
    const line = (p: string, n: string) => `  [${p}] › pages.visual.ts:20:3 › ${n}`;
    const full = [
      ...VISUAL_PROJECTS.flatMap((p) => VISUAL_SNAPSHOTS.map((s) => line(p, s))),
      `Total: ${VISUAL_PROJECTS.length * VISUAL_SNAPSHOTS.length} tests in 2 files`,
    ].join("\n");
    expect(listCountProblems(full, VISUAL_PROJECTS, VISUAL_SNAPSHOTS.length)).toEqual([]);
    const short = full.replace(line("visual-768", "page-home") + "\n", "").replace(/Total: \d+/, "Total: 35");
    expect(listCountProblems(short, VISUAL_PROJECTS, VISUAL_SNAPSHOTS.length)).toEqual([
      "playwright lists 35 visual tests; expected 36",
      "visual-768: 11 tests listed; expected 12",
    ]);
  });
  it("F3-41 / F4-55 the expected baseline set is the gallery, nine pages and the two tool states in each of the three projects", () => {
    expect(expectedBaselinePaths()).toHaveLength(36);
    expect(VISUAL_SNAPSHOTS.slice(-2)).toEqual(["tool-errors", "tool-nojs"]);
    expect(expectedBaselinePaths()).toContain("tests/visual/__screenshots__/visual-360/page-home-linux.png");
  });
});
