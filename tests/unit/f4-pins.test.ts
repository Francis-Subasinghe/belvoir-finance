/**
 * F4-31, F4-34, F4-40: pins on the repo that need no build. The F4-40 pin is
 * a function over the YAML text, so the flipped fixtures fail the same code.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { CSP_DIRECTIVES, cspString } from "../../src/config/site";
import { SITE_CSP, cspProblems } from "../helpers/csp";

const read = (p: string) => readFileSync(p, "utf8");

/** F4-40 (D10): the committed tool stays demo and uses no official values. */
function committedToolProblems(yamlText: string): string[] {
  const t = parse(yamlText) as Record<string, unknown>;
  const out: string[] = [];
  if (t["demo"] !== true) out.push(`demo is ${String(t["demo"])}, expected true`);
  if (t["usesOfficialValues"] !== false)
    out.push(`usesOfficialValues is ${String(t["usesOfficialValues"])}, expected false`);
  return out;
}

describe("F4-40 still demo, still illustrative", () => {
  it("F4-40 content/tools/cash-vs-profit.yaml keeps demo: true and usesOfficialValues: false", () => {
    expect(committedToolProblems(read("content/tools/cash-vs-profit.yaml"))).toEqual([]);
  });
  it.each([
    ["demo: false", "committed-tool-not-demo.yaml"],
    ["usesOfficialValues: true", "committed-tool-official.yaml"],
  ])("F4-40 the fixture flipped to %s fails the same check", (_n, f) => {
    expect(committedToolProblems(read(`tests/fixtures/f4/content/${f}`))).toHaveLength(1);
  });
});

describe("F4-31 no framework island", () => {
  it("F4-31 no UI framework in dependencies; Keystatic's React stays dev-only", () => {
    const pkg = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const deps = Object.keys(pkg.dependencies);
    for (const fw of [
      "react",
      "react-dom",
      "preact",
      "vue",
      "svelte",
      "solid-js",
      "lit",
      "@astrojs/react",
      "@astrojs/preact",
      "@astrojs/vue",
      "@astrojs/svelte",
      "@astrojs/solid-js",
    ]) {
      expect(deps, fw).not.toContain(fw);
    }
    expect(Object.keys(pkg.devDependencies)).toEqual(expect.arrayContaining(["react", "@astrojs/react"]));
  });
  it("F4-30 astro.config.mjs pins vite.build.assetsInlineLimit to 0", async () => {
    const text = read("astro.config.mjs");
    expect(text).toMatch(/vite:\s*\{\s*build:\s*\{[\s\S]*?assetsInlineLimit:\s*0,/);
    const config = (await import("../../astro.config.mjs")).default as {
      vite?: { build?: { assetsInlineLimit?: unknown } };
    };
    expect(config.vite?.build?.assetsInlineLimit).toBe(0);
  });
});

describe("F4-34 CSP: F1 plus Aegis Q-9", () => {
  it("F4-34 the emitted policy string is exactly the site CSP, in order, and passes the Q-9 check", () => {
    expect(cspString(CSP_DIRECTIVES)).toBe(SITE_CSP);
    expect(cspProblems(cspString(CSP_DIRECTIVES))).toEqual([]);
  });
  it("F4-34 CSP_DIRECTIVES deep-equals F1 with connect-src 'none' and require-trusted-types-for 'script' (Q-9)", () => {
    expect(CSP_DIRECTIVES).toStrictEqual({
      "default-src": "'self'",
      "script-src": "'self'",
      "style-src": "'self'",
      "img-src": "'self'",
      "font-src": "'self'",
      "connect-src": "'none'",
      "object-src": "'none'",
      "base-uri": "'self'",
      "form-action": "'self'",
      "upgrade-insecure-requests": "",
      "require-trusted-types-for": "'script'",
    });
  });
});
