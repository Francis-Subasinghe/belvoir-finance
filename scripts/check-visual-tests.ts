// Usage: npm run check:visual-tests   (part of npm run verify)
// F3-41: no visual spec skips a test, and Playwright lists exactly one test per
// expected snapshot in each visual project, so a full regeneration can't be partial.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { listCountProblems, skippedTestProblems } from "./visual-tests.ts";
import { VISUAL_PROJECTS, VISUAL_SNAPSHOTS } from "../tests/helpers/visual-pages.ts";

const specs = readdirSync("tests/visual").filter((f) => f.endsWith(".visual.ts"));
const problems = specs.flatMap((f) =>
  skippedTestProblems(`tests/visual/${f}`, readFileSync(`tests/visual/${f}`, "utf8")),
);
const list = execFileSync(
  "npx",
  [
    "playwright",
    "test",
    "-c",
    "playwright.visual.config.ts",
    "--list",
    ...VISUAL_PROJECTS.flatMap((p) => ["--project", p]),
  ],
  { encoding: "utf8" },
);
problems.push(...listCountProblems(list, VISUAL_PROJECTS, VISUAL_SNAPSHOTS.length));
for (const p of problems) console.error(`::error::${p}`);
if (problems.length > 0) process.exit(1);
console.log(
  `visual test check passed (${VISUAL_SNAPSHOTS.length} tests x ${VISUAL_PROJECTS.length} projects, none skipped)`,
);
