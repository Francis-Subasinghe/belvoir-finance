// Usage: npm run check:content  (runs with Node's built-in TypeScript support)
// Runs the same checks as `astro build`: the F1 Markdoc/MDX/link checks and
// the F3 content rules (src/lib/content-rules.ts). Prints every problem.
import { readFile } from "node:fs/promises";
import { checkContentDir } from "../src/lib/content-check.ts";
import { checkContentRules, formatProblem } from "../src/lib/content-rules.ts";

const markdoc = await checkContentDir("content", (f) => readFile(f, "utf8"));
for (const p of markdoc) {
  console.error(`${p.file ?? "?"}${p.line ? `:${p.line}` : ""} [${p.rule}] ${p.message}`);
}
const rules = checkContentRules("content");
for (const w of rules.warnings) console.warn(formatProblem(w));
for (const e of rules.errors) console.error(formatProblem(e));
const total = markdoc.length + rules.errors.length;
if (total > 0) {
  console.error(`\ncontent check failed: ${total} problem(s)`);
  process.exit(1);
}
console.log(`content check passed (${rules.entries.length} entries, ${rules.warnings.length} warning(s))`);
