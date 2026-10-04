// Usage: npm run check:content  (runs with Node's built-in TypeScript support)
import { readFile } from "node:fs/promises";
import { checkContentDir } from "../src/lib/content-check.ts";

const problems = await checkContentDir("content", (f) => readFile(f, "utf8"));
for (const p of problems) {
  console.error(`${p.file ?? "?"}${p.line ? `:${p.line}` : ""} [${p.rule}] ${p.message}`);
}
if (problems.length > 0) {
  console.error(`\ncontent check failed: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log("content check passed");
