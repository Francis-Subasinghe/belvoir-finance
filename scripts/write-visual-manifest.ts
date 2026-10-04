// Usage: npm run visual:manifest -- --run <run id> --artifact <artifact id> --commit <40-hex sha>
// Writes tests/visual/BASELINES.sha256 from the git-tracked *-linux.png baselines (F2-38).
// Pure Node (no network). Uses `git ls-files`, so `git add -f` the new baselines first.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { MANIFEST, SCREENSHOT_DIR, buildManifest, parseManifestArgs } from "./visual-baselines.ts";

const { source, errors } = parseManifestArgs(process.argv.slice(2));
if (!source) {
  for (const e of errors) console.error(e);
  process.exit(2);
}
const tracked = execFileSync("git", ["ls-files", "-z", "--", SCREENSHOT_DIR], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
let text: string;
try {
  text = buildManifest(".", tracked, source);
} catch (err) {
  console.error(`visual:manifest failed: ${(err as Error).message}`);
  process.exit(1);
}
writeFileSync(MANIFEST, text);
console.log(`wrote ${MANIFEST} (${text.split("\n").filter((l) => /^[0-9a-f]{64} /.test(l)).length} baseline(s))`);
