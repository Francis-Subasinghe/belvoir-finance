/**
 * The Lighthouse and visual-regression gates are blocking (TEST_STRATEGY.md checks 6
 * and 10). Pins the two workflow switches and the expressions they drive, so turning
 * a gate back to report-only is a deliberate, reviewed change to this test.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lighthouse = readFileSync(".github/workflows/lighthouse.yml", "utf8");
const ci = readFileSync(".github/workflows/ci.yml", "utf8");

/** The text of one job (from `  <id>:` to the next top-level job). */
const job = (yml: string, id: string): string => {
  const start = yml.indexOf(`\n  ${id}:\n`);
  expect(start, `job ${id}`).toBeGreaterThan(-1);
  const rest = yml.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z0-9-]+:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
};
const step = (text: string, name: string): string => {
  const start = text.indexOf(`- name: ${name}`);
  expect(start, `step ${name}`).toBeGreaterThan(-1);
  const next = text.indexOf("\n      - ", start + 1);
  return next === -1 ? text.slice(start) : text.slice(start, next);
};

describe("Lighthouse gate (lighthouse.yml)", () => {
  it('sets LHCI_BLOCKING: "true" once, at workflow level', () => {
    expect(lighthouse.match(/^ *LHCI_BLOCKING: /gm)).toHaveLength(1);
    expect(lighthouse).toMatch(/^env:\n {2}LHCI_BLOCKING: "true"$/m);
  });

  it("keeps the job name and lets collect, save and assert fail the job when blocking", () => {
    expect(lighthouse).toMatch(/^ {4}name: Lighthouse$/m);
    expect(lighthouse.match(/continue-on-error: \$\{\{ env\.LHCI_BLOCKING != 'true' \}\}/g)).toHaveLength(3);
    expect(lighthouse).not.toMatch(/continue-on-error: true/);
  });
});

describe("Visual regression gate (ci.yml)", () => {
  it('sets VISUAL_BLOCKING: "true" once, at workflow level', () => {
    expect(ci.match(/^ *VISUAL_BLOCKING: /gm)).toHaveLength(1);
    expect(ci).toMatch(/^env:\n {2}VISUAL_BLOCKING: "true"$/m);
  });

  it("keeps the job name and lets the comparison fail the job when blocking", () => {
    const visual = job(ci, "visual");
    expect(visual).toMatch(/^ {4}name: Visual regression$/m);
    expect(step(visual, "Compare with baselines")).toContain("continue-on-error: ${{ env.VISUAL_BLOCKING != 'true' }}");
    // Only the regeneration step may never fail; the comparison carries the job's result.
    expect(visual.match(/continue-on-error: true/g)).toHaveLength(1);
    expect(step(visual, "Regenerate the full baseline set")).toContain("continue-on-error: true");
  });

  it("on a compare failure regenerates the full gallery set and uploads it as visual-baselines", () => {
    const visual = job(ci, "visual");
    const names = [...visual.matchAll(/^ {6}- name: (.+)$/gm)].map((m) => m[1]);
    const at = (n: string) => names.findIndex((x) => x?.startsWith(n));
    expect(at("Compare with baselines")).toBeLessThan(at("Upload visual diff"));
    expect(at("Upload visual diff")).toBeLessThan(at("Regenerate the full baseline set"));
    expect(at("Regenerate the full baseline set")).toBeLessThan(at("Upload regenerated baselines"));
    expect(at("Upload regenerated baselines")).toBeLessThan(at("Visual summary"));

    const regen = step(visual, "Regenerate the full baseline set");
    expect(regen).toContain("if: always() && steps.compare.outcome == 'failure'");
    expect(regen).toContain("rm -rf tests/visual/__screenshots__");
    expect(regen).toContain("--project visual-360 --project visual-768 --project visual-1280 --update-snapshots=all");
    expect(regen).not.toMatch(/--project wireframes/);

    const upload = step(visual, "Upload regenerated baselines");
    expect(upload).toContain("if: always() && steps.compare.outcome == 'failure' && steps.regen.outcome == 'success'");
    expect(upload).toMatch(/uses: actions\/upload-artifact@[0-9a-f]{40} /);
    expect(upload).toContain("name: visual-baselines");
    expect(upload).toContain("path: tests/visual/__screenshots__/**/*-linux.png");
    expect(upload).toContain("if-no-files-found: error");
    expect(upload).toContain("retention-days: 30");
  });

  it("with no baselines committed: generates all three, uploads, and only then fails (blocking)", () => {
    const visual = job(ci, "visual");
    const names = [...visual.matchAll(/^ {6}- name: (.+)$/gm)].map((m) => m[1]);
    const at = (n: string) => names.findIndex((x) => x?.startsWith(n));
    expect(at("Look for committed baselines")).toBeLessThan(at("Generate baselines"));
    expect(at("Generate baselines")).toBeLessThan(at("Upload generated baselines"));
    expect(at("Upload generated baselines")).toBeLessThan(at("Fail when no baselines are committed"));
    expect(at("Fail when no baselines are committed")).toBeLessThan(at("Compare with baselines"));

    const generate = step(visual, "Generate baselines");
    expect(generate).toContain("if: steps.baselines.outputs.present == 'false'");
    expect(generate).toContain(
      "--project visual-360 --project visual-768 --project visual-1280 --update-snapshots=all",
    );
    expect(generate).not.toMatch(/--project wireframes|exit 1|::error::/);

    const upload = step(visual, "Upload generated baselines");
    expect(upload).toContain(
      "if: always() && steps.baselines.outputs.present == 'false' && steps.generate.outcome == 'success'",
    );
    expect(upload).toContain("name: visual-baselines");
    expect(upload).toContain("path: tests/visual/__screenshots__/**/*-linux.png");
    expect(upload).toContain("if-no-files-found: error");

    const fail = step(visual, "Fail when no baselines are committed");
    expect(fail).toContain(
      "if: always() && steps.baselines.outputs.present == 'false' && env.VISUAL_BLOCKING == 'true'",
    );
    expect(fail).toMatch(/::error::[\s\S]*exit 1/);
    expect(fail).not.toContain("continue-on-error");

    // The only ::error:: / exit 1 lines in the job are in that step.
    expect(visual.match(/::error::/g)).toHaveLength(1);
    expect(visual.match(/exit 1/g)).toHaveLength(1);
    expect(step(visual, "Compare with baselines")).toContain("if: steps.baselines.outputs.present == 'true'");
  });

  it("the summary prints the visual:manifest command from trusted context only", () => {
    const summary = step(job(ci, "visual"), "Visual summary");
    expect(summary).toContain("RUN_ID: ${{ github.run_id }}");
    // Aegis (Low): record the PR head commit (what was pushed), not the test merge commit.
    expect(summary).toContain("BUILT_SHA: ${{ github.event.pull_request.head.sha || github.sha }}");
    expect(summary).toContain("is the PR head commit (what was pushed");
    expect(summary).toContain("links it to the merge build");
    expect(summary).toContain("steps.regen-upload.outputs.artifact-id");
    expect(summary).toContain("npm run visual:manifest -- --run $RUN_ID --artifact $ARTIFACT_ID --commit $BUILT_SHA");
    // No ${{ }} inside the script itself: every value arrives through env.
    expect(summary.slice(summary.indexOf("run: |"))).not.toContain("${{");
  });

  it("keeps the workflow read-only", () => {
    expect(ci).toMatch(/^permissions:\n {2}contents: read$/m);
    const visual = job(ci, "visual");
    expect(visual).not.toMatch(/permissions:|git (commit|push)|secrets\./);
  });
});
