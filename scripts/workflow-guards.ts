// Repo guard: every actions/checkout step in .github/workflows/ sets
// `persist-credentials: false`, so the job's GITHUB_TOKEN is never left in .git/config
// for later steps (or a compromised dependency) to reuse. Pure function over the parsed
// workflow; the CLI is scripts/check-workflows.ts, the tests tests/unit/repo-guards.test.ts.
//
// Strict on purpose: the value must be the YAML boolean `false`. The quoted string
// "false" (which actions/checkout happens to accept today), `no`/`off` (strings under
// YAML 1.2) or an expression all fail, so nothing depends on how an input is coerced.

/** `actions/checkout`, at any ref (owner and name compare case-insensitively, like GitHub). */
export const isCheckout = (uses: unknown): boolean =>
  typeof uses === "string" && /^actions\/checkout(@|$)/i.test(uses.trim());

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Every actions/checkout step in a parsed workflow, with its job id and step index. */
export function checkoutSteps(workflow: unknown): { jobId: string; index: number; step: Record<string, unknown> }[] {
  if (!isObject(workflow) || !isObject(workflow["jobs"])) return [];
  return Object.entries(workflow["jobs"]).flatMap(([jobId, job]) => {
    // A job without steps (e.g. one calling a reusable workflow) has no checkout of its own.
    if (!isObject(job) || !Array.isArray(job["steps"])) return [];
    return job["steps"].flatMap((step: unknown, index: number) =>
      isObject(step) && isCheckout(step["uses"]) ? [{ jobId, index, step }] : [],
    );
  });
}

/** Every checkout step in a parsed workflow that does not set `with.persist-credentials: false`. */
export function checkoutProblems(file: string, workflow: unknown): string[] {
  if (!isObject(workflow) || !isObject(workflow["jobs"])) return [`${file}: no jobs mapping`];
  const out: string[] = [];
  for (const { jobId, index, step } of checkoutSteps(workflow)) {
    const where = `${file}: jobs.${jobId}.steps[${index}] (${String(step["uses"]).trim()})`;
    const withs = step["with"];
    if (!isObject(withs)) {
      out.push(`${where} has no \`with:\`; add persist-credentials: false`);
      continue;
    }
    if (!("persist-credentials" in withs)) {
      out.push(`${where} does not set persist-credentials: false`);
      continue;
    }
    const v = withs["persist-credentials"];
    if (v === false) continue;
    out.push(
      typeof v === "string"
        ? `${where} sets persist-credentials to the string "${v}"; use the YAML boolean false (unquoted)`
        : `${where} sets persist-credentials: ${JSON.stringify(v)}, expected false`,
    );
  }
  return out;
}
