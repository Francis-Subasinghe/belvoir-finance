// F3-41 (Atlas): a regenerated visual baseline set must be complete. These pure
// checks back scripts/check-visual-tests.ts and tests/unit/visual-tests.test.ts.

/** Calls that would drop or narrow a visual test: skip, fixme, only, fail, or a skip mode. */
const SKIPPERS: readonly [RegExp, string][] = [
  [/\b(test|it|describe)(\.describe)?\.(skip|fixme|only|fail)\b/g, "skips, narrows or inverts tests"],
  [/\bmode\s*:\s*["']skip["']/g, "sets a skip mode"],
  [/\btest\.slow\s*\(\s*[^)]/g, "is a conditional test.slow"],
];

/** Problems in one visual spec's source (comments are ignored). */
export function skippedTestProblems(file: string, code: string): string[] {
  const c = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const out: string[] = [];
  for (const [re, why] of SKIPPERS)
    for (const m of c.matchAll(re)) out.push(`${file}: \`${m[0]}\` ${why}; every visual test must run`);
  return out;
}

/** Problems with `playwright test --list` output against the expected per-project test count. */
export function listCountProblems(listOutput: string, projects: readonly string[], perProject: number): string[] {
  const out: string[] = [];
  const total = /Total: (\d+) tests? in/.exec(listOutput);
  const want = projects.length * perProject;
  if (!total) return [`playwright --list printed no "Total:" line`];
  if (Number(total[1]) !== want) out.push(`playwright lists ${total[1]} visual tests; expected ${want}`);
  for (const p of projects) {
    const n = listOutput.split("\n").filter((l) => l.includes(`[${p}] ›`)).length;
    if (n !== perProject) out.push(`${p}: ${n} tests listed; expected ${perProject}`);
  }
  return out;
}
