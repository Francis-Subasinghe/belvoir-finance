/**
 * F4-34 / Aegis Q-9: connect-src 'none' and require-trusted-types-for 'script',
 * with no Trusted Types policy allowed (no policy directive) or created (no
 * createPolicy). Negative fixtures in tests/fixtures/f4/csp/ go through the
 * same checks the build tests run on dist/ and dist-gallery/.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cspOf } from "../helpers/built-site";
import { SITE_CSP, cspProblems, parseCsp, trustedTypesPolicyProblems } from "../helpers/csp";

const FX = "tests/fixtures/f4/csp";
const fx = (name: string) => readFileSync(join(FX, name), "utf8");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

describe("F4-34 the Q-9 CSP check", () => {
  it("the positive fixture carries exactly the site CSP and passes", () => {
    expect(cspOf(fx("ok.html"))).toBe(SITE_CSP);
    expect(cspProblems(cspOf(fx("ok.html")))).toEqual([]);
  });
  const NEGATIVE: [string, string][] = [
    ["connect-missing.html", "connect-src is missing"],
    ["connect-self.html", `connect-src is "'self'", not 'none'`],
    ["connect-other.html", `connect-src is "https://api.example.com", not 'none'`],
    ["tt-missing.html", "require-trusted-types-for is missing"],
    ["tt-policy-directive.html", "a trusted-types directive allows a policy"],
  ];
  for (const [file, message] of NEGATIVE) {
    it(`${file} fails: ${message}`, () => {
      const problems = cspProblems(cspOf(fx(file)));
      expect(problems.join(" | ")).toContain(message);
    });
  }
  it("any other changed, missing or extra directive fails too", () => {
    expect(cspProblems(SITE_CSP.replace("object-src 'none'", "object-src 'self'"))).toEqual([
      `object-src changed: "'self'", expected "'none'"`,
    ]);
    expect(cspProblems(`${SITE_CSP}; worker-src 'self'`)).toEqual(["unexpected directive worker-src"]);
    expect(
      cspProblems(SITE_CSP.replace("require-trusted-types-for 'script'", "require-trusted-types-for 'none'")),
    ).toEqual([`require-trusted-types-for is "'none'", not 'script'`]);
  });
  it("parses directives without values (upgrade-insecure-requests)", () => {
    expect(parseCsp(SITE_CSP).get("upgrade-insecure-requests")).toBe("");
  });
});

describe("F4-34 no Trusted Types policy in source or bundles", () => {
  it("the fixtures that create a policy (source and minified bundle) or name a policy directive fail", () => {
    expect(trustedTypesPolicyProblems("tt-create-policy.ts.fixture", fx("tt-create-policy.ts.fixture"))).toEqual([
      "tt-create-policy.ts.fixture: creates a Trusted Types policy (createPolicy)",
    ]);
    expect(trustedTypesPolicyProblems("tt-create-policy.js.fixture", fx("tt-create-policy.js.fixture"))).toEqual([
      "tt-create-policy.js.fixture: creates a Trusted Types policy (createPolicy)",
    ]);
    expect(trustedTypesPolicyProblems("tt-policy-directive.html", fx("tt-policy-directive.html"))).toEqual([
      "tt-policy-directive.html: names a trusted-types policy directive",
    ]);
  });
  it("require-trusted-types-for on its own is not a policy directive", () => {
    expect(trustedTypesPolicyProblems("ok.html", fx("ok.html"))).toEqual([]);
  });
  it("src/, scripts/, astro.config.mjs and the Lighthouse tooling create no policy and name no policy directive", () => {
    const files = [
      ...walk("src"),
      ...walk("scripts"),
      "astro.config.mjs",
      ...walk("tools/lighthouse").filter((f) => !f.includes("node_modules")),
    ].filter((f) => /\.(ts|mts|mjs|js|cjs|astro|json|css|md|yaml)$/.test(f));
    expect(files.length).toBeGreaterThan(20);
    expect(files.flatMap((f) => trustedTypesPolicyProblems(f, readFileSync(f, "utf8")))).toEqual([]);
  });
});
