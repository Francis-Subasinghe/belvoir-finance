/**
 * F5-34, F5-36 to F5-40, F5-53: the L4 intake workflow (.github/workflows/intake.yml).
 * Every rule runs through the same exported check (scripts/intake-workflow.ts) on the
 * real workflow and on each negative fixture in tests/fixtures/f5/workflows/.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { EXPRESSION_ALLOWLIST, intakeWorkflowProblems } from "../../scripts/intake-workflow.ts";

const WORKFLOW = ".github/workflows/intake.yml";
const FX = "tests/fixtures/f5/workflows";
const text = readFileSync(WORKFLOW, "utf8");
const wf = parse(text) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const job = wf["jobs"]["intake"];
const runs: string[] = job["steps"].flatMap((s: { run?: string }) => (s.run ? [s.run] : []));

describe("F5-36 to F5-40 / F5-53 the real intake.yml", () => {
  it("F5-36 F5-37 F5-38 F5-39 F5-40 F5-53 the workflow passes every rule", () => {
    expect(intakeWorkflowProblems(text)).toEqual([]);
  });

  it("F5-36 the only trigger is workflow_dispatch, with no inputs and no schedule", () => {
    expect(Object.keys(wf["on"])).toEqual(["workflow_dispatch"]);
    expect(wf["on"]["workflow_dispatch"]).toBeNull();
    expect(text).not.toMatch(/^\s*schedule:/m);
  });

  it("F5-37 top-level permissions are {} and the job has exactly contents: read", () => {
    expect(wf["permissions"]).toEqual({});
    expect(Object.keys(wf["jobs"])).toEqual(["intake"]);
    expect(job["permissions"]).toEqual({ contents: "read" });
  });

  it("F5-37 no secrets, no token, checkout without persisted credentials", () => {
    expect(text).not.toMatch(/secrets\./);
    expect(text).not.toMatch(/GITHUB_TOKEN|github\.token/);
    expect(job["steps"][0]).toEqual({
      uses: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
      with: { "persist-credentials": false },
    });
  });

  it("F5-34 F5-37 F5-40 artifact only: upload-artifact is the one write, and no step opens a PR, issue or comment", () => {
    const uses = job["steps"].flatMap((s: { uses?: string }) => (s.uses ? [s.uses.split("@")[0]] : []));
    expect(uses).toEqual(["actions/checkout", "actions/setup-node", "actions/upload-artifact"]);
    for (const r of runs) expect(r).not.toMatch(/\bgh\s|git\s+(push|commit)|curl|wget|issue|comment/);
    const upload = job["steps"].at(-1);
    expect(upload.with).toEqual({
      name: "intake-queue",
      path: "${{ runner.temp }}/intake/",
      "if-no-files-found": "error",
      "include-hidden-files": false,
      "retention-days": 7,
    });
  });

  it("F5-38 run: scripts are fixed commands with no ${{ }}, and the only expressions are allowlisted", () => {
    expect(EXPRESSION_ALLOWLIST).toEqual(["github.run_id", "github.sha", "runner.temp"]);
    for (const r of runs) expect(r).not.toContain("${{");
    expect(runs.slice(0, 3)).toEqual([
      "npm ci",
      'npm run intake -- --fixtures tests/fixtures/f5 --out "$RUNNER_TEMP/intake"',
      'npm run intake:verify -- "$RUNNER_TEMP/intake" --registry tests/fixtures/f5/registry',
    ]);
    expect(text).not.toMatch(/GITHUB_OUTPUT|GITHUB_ENV/);
    // F5-28: no trust-store override reaches the job (intake would stop on it anyway).
    expect(text).not.toMatch(/NODE_EXTRA_CA_CERTS|NODE_OPTIONS|--use-openssl-ca|--use-system-ca/);
  });

  it("F5-39 pinned SHAs as in ci.yml, ubuntu-24.04, timeout <= 10, concurrency without cancel, Node from .nvmrc", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    for (const s of job["steps"].filter((x: { uses?: string }) => x.uses)) {
      expect(s.uses).toMatch(/@[0-9a-f]{40}$/);
      expect(ci + readFileSync(".github/workflows/lighthouse.yml", "utf8")).toContain(`uses: ${s.uses} `);
    }
    expect(job["runs-on"]).toBe("ubuntu-24.04");
    expect(job["timeout-minutes"]).toBeLessThanOrEqual(10);
    expect(wf["concurrency"]).toEqual({ group: "intake", "cancel-in-progress": false });
    expect(job["steps"][1].with["node-version-file"]).toBe(".nvmrc");
  });

  it("F5-28 F5-53 no NODE_TLS_REJECT_UNAUTHORIZED, no live transport and no http(s) URL in the job", () => {
    expect(text).not.toContain("NODE_TLS_REJECT_UNAUTHORIZED");
    expect(text).not.toMatch(/--live\b|INTAKE_LIVE/);
    expect(JSON.stringify(job)).not.toMatch(/https?:\/\//i);
  });

  it("F5-40 the queue is checked before the upload", () => {
    const names = job["steps"].map((s: { name?: string; uses?: string }) => s.name ?? s.uses);
    expect(names.indexOf("F5-40 / F5-51: check the queue before upload")).toBeLessThan(names.length - 1);
  });
});

describe("F5-36 to F5-40 / F5-53 negative workflow fixtures fail the same check", () => {
  it("the positive control is the real workflow body and passes", () => {
    const ok = readFileSync(join(FX, "ok.yml"), "utf8");
    expect(ok.slice(ok.indexOf("on:\n"))).toBe(text.slice(text.indexOf("on:\n")));
    expect(intakeWorkflowProblems(ok)).toEqual([]);
  });

  const EXPECT: Record<string, string> = {
    "trigger-schedule.yml": "F5-36: triggers are [workflow_dispatch, schedule]",
    "trigger-push.yml": "F5-36: triggers are [workflow_dispatch, push]",
    "trigger-pull-request-target.yml": "F5-36: triggers are [workflow_dispatch, pull_request_target]",
    "trigger-inputs.yml": "F5-36: workflow_dispatch has inputs",
    "perm-top-level-read.yml": "F5-37: top-level permissions must be {}",
    "perm-contents-write.yml": "F5-37: jobs.intake.permissions must be exactly { contents: read }",
    "perm-pull-requests-write.yml": "F5-37: jobs.intake.permissions must be exactly { contents: read }",
    "perm-issues-write.yml": "F5-37: jobs.intake.permissions must be exactly { contents: read }",
    "secret-ref.yml": "F5-37: references secrets.",
    "secret-env-token.yml": "F5-37: jobs.intake.env.GH_TOKEN looks like a token",
    "secret-persist-credentials.yml": "checkout without persist-credentials: false",
    "write-step.yml": 'run: uses "gh"',
    "issue-step.yml": "uses actions/github-script, not on the allowlist",
    "expr-run.yml": "F5-38: expression ${{ github.event.inputs.dir }} is not allowlisted",
    "output.yml": 'run: uses "GITHUB_OUTPUT"',
    "harden-unpinned.yml": "is not pinned to a 40-character SHA",
    "harden-latest.yml": "runs-on must be ubuntu-24.04",
    "harden-no-timeout.yml": "timeout-minutes must be 1 to 10",
    "harden-cancel.yml": "cancel-in-progress: false",
    "live-transport.yml": "F5-53: jobs.intake selects the live transport",
    "live-env.yml": "F5-53: jobs.intake selects the live transport",
    "live-url.yml": "F5-53: jobs.intake contains an http(s) URL",
    "tls-override.yml": "F5-28: NODE_TLS_REJECT_UNAUTHORIZED",
    "tls-ca-certs.yml": "F5-28: NODE_EXTRA_CA_CERTS is set or mentioned",
    "tls-node-options.yml": "F5-28: NODE_OPTIONS is set",
    "upload-before-verify.yml": "F5-40: intake:verify must run before the upload",
    "upload-other-path.yml": "F5-40: the artifact must be exactly",
    "verify-registry.yml": "F5-40: jobs.intake intake:verify --registry must be tests/fixtures/f5/registry",
  };

  it.each(["content/sources", "tests/fixtures/f5/registry/..", "/etc", "tests/fixtures/f5"])(
    "F5-40 a verify --registry of %s (not <fixtures>/registry) fails",
    (reg) => {
      const ok = readFileSync(join(FX, "ok.yml"), "utf8");
      const bad = ok.replace("--registry tests/fixtures/f5/registry", `--registry ${reg}`);
      expect(bad).not.toBe(ok);
      expect(intakeWorkflowProblems(bad).join(" | ")).toContain("intake:verify --registry must be");
    },
  );

  it("every fixture file has an expectation, and vice versa", () => {
    const files = readdirSync(FX).filter((f) => f !== "ok.yml");
    expect(files.sort()).toEqual(Object.keys(EXPECT).sort());
  });

  for (const [file, problem] of Object.entries(EXPECT)) {
    const id = /^F5-\d+/.exec(problem)?.[0] ?? (file.startsWith("harden") ? "F5-39" : "F5-37");
    it(`${id} ${file} fails: ${problem}`, () => {
      expect(intakeWorkflowProblems(readFileSync(join(FX, file), "utf8")).join(" | ")).toContain(problem);
    });
  }
});
