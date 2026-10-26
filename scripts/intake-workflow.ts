// F5-34, F5-36 to F5-40, F5-53: the rules for .github/workflows/intake.yml, as one pure
// function over the workflow text. tests/unit/intake-workflow.test.ts runs it on the real
// workflow and on every fixture in tests/fixtures/f5/workflows/.
import { parse } from "yaml";

/** The only `${{ }}` expressions allowed anywhere in the workflow (F5-38), never inside `run:`. */
export const EXPRESSION_ALLOWLIST = ["github.run_id", "github.sha", "runner.temp"] as const;
/** The only actions the intake job may use; upload-artifact is its only write (F5-37). */
export const ACTION_ALLOWLIST = ["actions/checkout", "actions/setup-node", "actions/upload-artifact"] as const;
/** Shell commands that write to GitHub, reach the network or pick the live transport. */
const FORBIDDEN_RUN =
  /\b(?:gh|hub)\s|\bgit\s+(?:push|commit|tag|remote|config)\b|\bcurl\b|\bwget\b|\bnc\b|\bssh\b|--live\b|\bINTAKE_LIVE\b|GITHUB_OUTPUT|GITHUB_ENV|GITHUB_TOKEN|NODE_TLS_REJECT_UNAUTHORIZED/;
const SHA_PIN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]+@[0-9a-f]{40}$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Every string value in a parsed YAML tree (keys included), for whole-job scans. */
function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (isObj(v)) return Object.entries(v).flatMap(([k, x]) => [k, ...strings(x)]);
  return [];
}

export function intakeWorkflowProblems(text: string): string[] {
  const out: string[] = [];
  let wf: unknown;
  try {
    wf = parse(text, { uniqueKeys: true, maxAliasCount: 0 });
  } catch (e) {
    return [`parse: ${(e as Error).message.split("\n")[0]}`];
  }
  if (!isObj(wf)) return ["parse: not a mapping"];

  // F5-36: exactly workflow_dispatch, no inputs.
  const on = wf["on"];
  const triggers = isObj(on)
    ? Object.keys(on)
    : typeof on === "string"
      ? [on]
      : Array.isArray(on)
        ? on.map(String)
        : [];
  if (triggers.length !== 1 || triggers[0] !== "workflow_dispatch")
    out.push(`F5-36: triggers are [${triggers.join(", ")}], expected exactly workflow_dispatch`);
  const dispatch = isObj(on) ? on["workflow_dispatch"] : undefined;
  if (dispatch !== null && dispatch !== undefined && !(isObj(dispatch) && Object.keys(dispatch).length === 0))
    out.push("F5-36: workflow_dispatch has inputs or settings");

  // F5-37: permissions.
  if (!isObj(wf["permissions"]) || Object.keys(wf["permissions"]).length !== 0)
    out.push("F5-37: top-level permissions must be {}");
  if (/secrets\./.test(text)) out.push("F5-37: references secrets.");
  if (/NODE_TLS_REJECT_UNAUTHORIZED/.test(text)) out.push("F5-28: NODE_TLS_REJECT_UNAUTHORIZED is set or mentioned");
  // F5-28: no trust-store override either; intake refuses to run with one (src/lib/intake/run.ts).
  if (/NODE_EXTRA_CA_CERTS/.test(text)) out.push("F5-28: NODE_EXTRA_CA_CERTS is set or mentioned");
  if (/NODE_OPTIONS/.test(text)) out.push("F5-28: NODE_OPTIONS is set (could add --use-openssl-ca or --use-system-ca)");

  // F5-38: expressions.
  // Parsed values only, so a comment that mentions the syntax doesn't count.
  for (const m of strings(wf)
    .join("\n")
    .matchAll(/\$\{\{([\s\S]*?)\}\}/g)) {
    const expr = (m[1] ?? "").trim();
    if (!(EXPRESSION_ALLOWLIST as readonly string[]).includes(expr))
      out.push(`F5-38: expression \${{ ${expr} }} is not allowlisted`);
  }

  // F5-39: concurrency.
  const conc = wf["concurrency"];
  if (!isObj(conc) || typeof conc["group"] !== "string" || conc["cancel-in-progress"] !== false)
    out.push("F5-39: needs a concurrency group with cancel-in-progress: false");

  const jobs = isObj(wf["jobs"]) ? wf["jobs"] : {};
  if (Object.keys(jobs).length === 0) out.push("jobs: none");
  for (const [id, job] of Object.entries(jobs)) {
    if (!isObj(job)) continue;
    const at = `jobs.${id}`;
    const perms = job["permissions"];
    if (!isObj(perms) || Object.keys(perms).length !== 1 || perms["contents"] !== "read")
      out.push(`F5-37: ${at}.permissions must be exactly { contents: read }`);
    if (job["runs-on"] !== "ubuntu-24.04") out.push(`F5-39: ${at} runs-on must be ubuntu-24.04`);
    const t = job["timeout-minutes"];
    if (typeof t !== "number" || t > 10 || t <= 0) out.push(`F5-39: ${at} timeout-minutes must be 1 to 10`);
    for (const [k, v] of Object.entries(isObj(job["env"]) ? job["env"] : {}))
      if (/token|secret|password/i.test(k) || /token/i.test(String(v)))
        out.push(`F5-37: ${at}.env.${k} looks like a token`);
    // F5-53: no http(s) URL anywhere in the job's values (pinned `uses:` refs carry none).
    if (strings(job).some((s) => /https?:\/\//i.test(s))) out.push(`F5-53: ${at} contains an http(s) URL`);
    // F5-53: nothing in the job (a step's env, a flag) selects the live transport.
    if (strings(job).some((s) => /\bINTAKE_LIVE\b|--live\b/.test(s)))
      out.push(`F5-53: ${at} selects the live transport`);

    const steps = Array.isArray(job["steps"]) ? job["steps"] : [];
    let npmCi = false;
    let nodeFromNvmrc = false;
    let fixturesRun = false;
    let fixturesDir: string | undefined;
    let verifyRegistry: string | undefined;
    let verifyAt = -1;
    const uploads: number[] = [];
    steps.forEach((step: unknown, i: number) => {
      if (!isObj(step)) return;
      const where = `${at}.steps[${i}]`;
      const withs = isObj(step["with"]) ? step["with"] : {};
      for (const [k, v] of Object.entries(withs))
        if (/token/i.test(k) || /token/i.test(String(v))) out.push(`F5-37: ${where}.with.${k} passes a token`);
      for (const [k, v] of Object.entries(isObj(step["env"]) ? step["env"] : {}))
        if (/token|secret|password/i.test(k) || /token/i.test(String(v)))
          out.push(`F5-37: ${where}.env.${k} looks like a token`);
      if (typeof step["uses"] === "string") {
        const uses = step["uses"].trim();
        const name = uses.split("@")[0] ?? "";
        if (!SHA_PIN.test(uses)) out.push(`F5-39: ${where} ${uses} is not pinned to a 40-character SHA`);
        if (!(ACTION_ALLOWLIST as readonly string[]).includes(name))
          out.push(`F5-37: ${where} uses ${name}, not on the allowlist`);
        if (name === "actions/checkout" && withs["persist-credentials"] !== false)
          out.push(`F5-37: ${where} checkout without persist-credentials: false`);
        if (name === "actions/setup-node" && withs["node-version-file"] === ".nvmrc") nodeFromNvmrc = true;
        if (name === "actions/upload-artifact") uploads.push(i);
      }
      if (typeof step["run"] === "string") {
        const run = step["run"];
        if (run.includes("${{")) out.push(`F5-38: ${where} run: contains a \${{ }} expression`);
        const bad = FORBIDDEN_RUN.exec(run);
        if (bad) out.push(`F5-37/F5-53: ${where} run: uses "${bad[0].trim()}"`);
        if (run.trim() === "npm ci") npmCi = true;
        const fx = /^npm run intake -- --fixtures (\S+) --out "\$RUNNER_TEMP\/intake"$/.exec(run.trim());
        if (fx) {
          fixturesRun = true;
          fixturesDir = fx[1];
        }
        // The verify reads the same registry intake ran on (`<fixtures>/registry`), never content/.
        const vf = /^npm run intake:verify -- "\$RUNNER_TEMP\/intake" --registry (\S+)$/.exec(run.trim());
        if (vf) {
          verifyAt = i;
          verifyRegistry = vf[1];
        }
      }
    });
    if (!npmCi) out.push(`F5-39: ${at} has no plain "npm ci" step`);
    if (!nodeFromNvmrc) out.push(`F5-39: ${at} does not take Node from .nvmrc`);
    if (!fixturesRun) out.push(`F5-53: ${at} does not run intake on --fixtures into $RUNNER_TEMP/intake`);
    if (verifyAt !== -1 && fixturesDir !== undefined && verifyRegistry !== `${fixturesDir}/registry`)
      out.push(`F5-40: ${at} intake:verify --registry must be ${fixturesDir}/registry`);
    if (uploads.length !== 1)
      out.push(`F5-40: ${at} must have exactly one upload-artifact step (has ${uploads.length})`);
    else {
      const up = steps[uploads[0] ?? 0] as Obj;
      const w = isObj(up["with"]) ? up["with"] : {};
      if (w["path"] !== "${{ runner.temp }}/intake/")
        out.push("F5-40: the artifact must be exactly ${{ runner.temp }}/intake/");
      if (verifyAt === -1 || verifyAt > (uploads[0] ?? 0)) out.push("F5-40: intake:verify must run before the upload");
    }
  }
  return out;
}
