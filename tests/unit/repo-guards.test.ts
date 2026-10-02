import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
  engines: { node: string };
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const astroConfig = readFileSync("astro.config.mjs", "utf8");

function repoFiles(dir = "."): string[] {
  const skip = new Set(["node_modules", ".git", "dist", ".astro", "coverage", "tests"]);
  return readdirSync(dir).flatMap((n) => {
    if (skip.has(n)) return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? repoFiles(p) : [p];
  });
}

describe("F1-01 toolchain pinning", () => {
  it("pins Node in .nvmrc and package.json engines consistently", () => {
    const nvmrc = readFileSync(".nvmrc", "utf8").trim();
    expect(nvmrc).toMatch(/^\d+$/);
    expect(pkg.engines.node).toContain(`>=${nvmrc}.`);
    expect(pkg.engines.node).toContain(`<${Number(nvmrc) + 1}`);
  });

  it("commits package-lock.json and pins exact dependency versions", () => {
    expect(existsSync("package-lock.json")).toBe(true);
    for (const v of Object.values({ ...pkg.dependencies, ...pkg.devDependencies })) {
      expect(v).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("has no MDX integration installed (F1-11)", () => {
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain("@astrojs/mdx");
  });

  it("F1-04/F1-05 provides the scripts CI calls", () => {
    for (const s of ["format:check", "lint", "typecheck", "test", "build"]) expect(pkg.scripts[s]).toBeTruthy();
  });
});

describe("F1-30 dev and preview servers bind to localhost only", () => {
  it("no script passes --host or 0.0.0.0", () => {
    for (const cmd of Object.values(pkg.scripts)) {
      expect(cmd).not.toMatch(/--host|0\.0\.0\.0/);
    }
  });

  it("astro.config binds the server to 127.0.0.1 and never host: true", () => {
    expect(astroConfig).toMatch(/server:\s*\{\s*host:\s*"127\.0\.0\.1"/);
    expect(astroConfig).not.toMatch(/host:\s*true|0\.0\.0\.0/);
  });
});

describe("F1-07 Keystatic is local-mode only", () => {
  const ks = readFileSync("keystatic.config.ts", "utf8");

  it("uses storage kind local", () => {
    expect(ks).toMatch(/storage:\s*\{\s*kind:\s*"local"\s*\}/);
    expect(ks).not.toMatch(/kind:\s*"(github|cloud)"/);
  });

  it("no GitHub-mode secrets or client ids anywhere in the repo", () => {
    const pattern = /KEYSTATIC_(GITHUB_CLIENT_ID|GITHUB_CLIENT_SECRET|SECRET)|PUBLIC_KEYSTATIC_GITHUB_APP_SLUG/;
    const offenders = repoFiles().filter(
      (f) => !f.endsWith("package-lock.json") && pattern.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("Keystatic is only loaded for `astro dev` with BELVOIR_KEYSTATIC=1", () => {
    expect(astroConfig).toMatch(/const isDev = process\.argv\.includes\("dev"\)/);
    expect(astroConfig).toMatch(/const keystaticMode = isDev && process\.env\.BELVOIR_KEYSTATIC === "1"/);
    expect(astroConfig).toMatch(/if \(keystaticMode\) \{[\s\S]*@keystatic\/astro/);
  });
});

describe("F1-17 secrets hygiene", () => {
  it(".env.example holds placeholder values only", () => {
    const lines = readFileSync(".env.example", "utf8")
      .split("\n")
      .filter((l) => l.trim() && !l.startsWith("#"));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const value = line.split("=").slice(1).join("=");
      expect(value === "replace-me" || value.endsWith(".invalid") || value === "true" || value === "false").toBe(true);
    }
  });

  it("no token-shaped strings in tracked source", () => {
    const tokenish = /(ghp_|github_pat_|gho_|sk_live_|AKIA)[A-Za-z0-9_]{12,}/;
    const offenders = repoFiles().filter(
      (f) => !f.endsWith("package-lock.json") && tokenish.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("no email addresses outside placeholder domains", () => {
    const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    const offenders: string[] = [];
    for (const f of repoFiles()) {
      if (f.endsWith("package-lock.json")) continue;
      for (const m of readFileSync(f, "utf8").matchAll(email)) {
        if (!/@(example\.(org|com|invalid)|[^@]*\.invalid)$/.test(m[0])) offenders.push(`${f}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
