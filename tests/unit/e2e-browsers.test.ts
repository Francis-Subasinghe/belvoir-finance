import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import e2e from "../../playwright.config.ts";
import visual from "../../playwright.visual.config.ts";

type Step = { name?: string; run?: string };
type Job = { steps?: Step[] };

describe("V2-21 Firefox E2E project", () => {
  const names = (e2e.projects ?? []).map((p) => [p.name, p.use?.defaultBrowserType ?? "chromium"]);

  it("E2E config has chromium and firefox projects", () => {
    expect(names.some(([, b]) => b === "chromium")).toBe(true);
    expect(names).toContainEqual(["firefox", "firefox"]);
  });

  it("visual config has no firefox project", () => {
    for (const p of visual.projects ?? []) {
      expect(p.use?.defaultBrowserType ?? "chromium").toBe("chromium");
      expect(p.name).not.toMatch(/firefox/i);
    }
  });

  it("CI installs firefox in the job that runs the E2E suite", () => {
    const ci = parse(readFileSync(".github/workflows/ci.yml", "utf8")) as { jobs: Record<string, Job> };
    const jobs = Object.values(ci.jobs).filter((j) => j.steps?.some((s) => /npm run test:e2e\b/.test(s.run ?? "")));
    expect(jobs).toHaveLength(1);
    const steps = jobs[0]?.steps ?? [];
    const install = steps.findIndex((s) => /npx playwright install --with-deps\b.*\bfirefox\b/.test(s.run ?? ""));
    const run = steps.findIndex((s) => /npm run test:e2e\b/.test(s.run ?? ""));
    expect(install).toBeGreaterThanOrEqual(0);
    expect(install).toBeLessThan(run);
    expect(steps[install]?.run).toMatch(/\bchromium\b/);
  });
});
