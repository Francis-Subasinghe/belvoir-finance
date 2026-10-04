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
    expect(step(visual, "Generate baselines")).toMatch(/if \[ "\$VISUAL_BLOCKING" = "true" \]; then[\s\S]*exit 1/);
    expect(visual).not.toMatch(/continue-on-error: true/);
  });
});
