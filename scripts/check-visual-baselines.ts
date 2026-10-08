// Usage: npm run check:visual-baselines  (Node's built-in TypeScript support, no network)
// Checks git-tracked visual baselines against tests/visual/BASELINES.sha256 (F2-38), and
// that they are exactly the set the visual specs produce (tests/helpers/visual-pages.ts).
// Uses `git ls-files`, so ignored local renders on a developer machine don't count; each
// untracked *-linux.png on disk gets a ::warning:: (exit code unaffected).
import { execFileSync } from "node:child_process";
import { SCREENSHOT_DIR, checkBaselines, untrackedBaselineWarnings } from "./visual-baselines.ts";
import { expectedBaselinePaths } from "../tests/helpers/visual-pages.ts";

const tracked = execFileSync("git", ["ls-files", "-z", "--", SCREENSHOT_DIR], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
for (const w of untrackedBaselineWarnings(".", tracked)) console.warn(`::warning::${w}`);
// Coverage: exactly (gallery + VISUAL_PAGES) x VISUAL_PROJECTS, from the spec source of truth.
const problems = checkBaselines(".", tracked, expectedBaselinePaths());
for (const p of problems) console.error(`::error::${p}`);
if (problems.length > 0) {
  console.error(`visual baseline check failed: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`visual baseline check passed (${tracked.filter((f) => f.endsWith("-linux.png")).length} baseline(s))`);
