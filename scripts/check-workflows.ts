// Usage: npm run check:workflows  (Node's built-in TypeScript support; needs the `yaml` dev dependency)
// Repo guard: every actions/checkout step in .github/workflows/*.yml|*.yaml sets
// persist-credentials: false (scripts/workflow-guards.ts). Prints every problem.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { checkoutProblems, checkoutSteps } from "./workflow-guards.ts";

const DIR = ".github/workflows";
const files = readdirSync(DIR)
  .filter((f) => /\.ya?ml$/.test(f))
  .sort();
const problems: string[] = [];
let checkouts = 0;
for (const f of files) {
  const path = join(DIR, f);
  let doc: unknown;
  try {
    doc = parse(readFileSync(path, "utf8"));
  } catch (e) {
    problems.push(`${path}: does not parse: ${(e as Error).message.split("\n")[0]}`);
    continue;
  }
  problems.push(...checkoutProblems(path, doc));
  checkouts += checkoutSteps(doc).length;
}
for (const p of problems) console.error(`::error::${p}`);
if (files.length === 0 || problems.length > 0) {
  console.error(
    `\nworkflow check failed: ${files.length === 0 ? "no workflows found" : `${problems.length} problem(s)`}`,
  );
  process.exit(1);
}
console.log(
  `workflow check passed (${files.length} workflow(s), ${checkouts} checkout step(s), all persist-credentials: false)`,
);
