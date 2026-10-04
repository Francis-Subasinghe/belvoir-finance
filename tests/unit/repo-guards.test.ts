import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
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
  const skip = new Set(["node_modules", ".git", "dist", "dist-gallery", ".astro", "coverage", "tests"]);
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

// Same pattern as the CI "F1-30" guard step.
const EXPOSED_HOST = /--host|0\.0\.0\.0|host:\s*true/;

/** Extracts the `run: |` block of the named step from ci.yml. */
function ciStepScript(stepName: string): string {
  const lines = readFileSync(".github/workflows/ci.yml", "utf8").split("\n");
  const start = lines.findIndex((l) => l.includes(`name: "${stepName}`));
  if (start === -1) throw new Error(`step not found: ${stepName}`);
  const runAt = lines.findIndex((l, i) => i > start && /^\s*run: \|\s*$/.test(l));
  const indent = (lines[runAt + 1] ?? "").search(/\S/);
  const body: string[] = [];
  for (const line of lines.slice(runAt + 1)) {
    if (line.trim() !== "" && line.search(/\S/) < indent) break;
    body.push(line.slice(indent));
  }
  return body.join("\n");
}

describe("F1-30 dev and preview servers bind to localhost only", () => {
  it("nothing under scripts/ passes --host, 0.0.0.0 or host: true", () => {
    const files = readdirSync("scripts").map((f) => join("scripts", f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(EXPOSED_HOST);
  });

  describe.skipIf(process.platform === "win32")("the CI guard step itself (Aegis L1)", () => {
    const guard = ciStepScript("F1-30");
    const runGuard = (files: Record<string, string>) => {
      const dir = mkdtempSync(join(tmpdir(), "belvoir-f130-"));
      try {
        for (const [name, body] of Object.entries(files)) {
          mkdirSync(join(dir, name, ".."), { recursive: true });
          writeFileSync(join(dir, name), body);
        }
        return spawnSync("bash", ["-e", "-c", guard], { cwd: dir, encoding: "utf8" }).status;
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };
    const safe = {
      "package.json": '{"scripts":{"dev":"astro dev"}}',
      "astro.config.mjs": 'server: { host: "127.0.0.1" }',
    };

    it("scans scripts/", () => {
      expect(guard).toMatch(/\bscripts\b/);
    });

    it("passes a localhost-only project", () => {
      expect(runGuard({ ...safe, "scripts/dev.ts": 'spawn("npx", ["astro", "dev"])' })).toBe(0);
    });

    it.each([
      ["scripts/dev.ts", 'spawn("npx", ["astro", "dev", "--host"])'],
      ["scripts/nested/serve.mjs", 'listen(4321, "0.0.0.0")'],
      ["scripts/cfg.ts", "server: { host: true }"],
      ["package.json", '{"scripts":{"dev":"astro dev --host"}}'],
      ["astro.config.mjs", "server: { host: true }"],
    ])("fails when %s exposes the server", (name, body) => {
      expect(runGuard({ ...safe, [name]: body })).toBe(1);
    });
  });

  it("no npm script passes --host or 0.0.0.0", () => {
    for (const cmd of Object.values(pkg.scripts)) {
      expect(cmd).not.toMatch(EXPOSED_HOST);
    }
  });

  it("astro.config binds the server to 127.0.0.1 and never host: true", () => {
    expect(astroConfig).toMatch(/server:\s*\{\s*host:\s*"127\.0\.0\.1"/);
    expect(astroConfig).not.toMatch(/host:\s*true|0\.0\.0\.0/);
  });
});

describe("Runner pin: no -latest runner images", () => {
  it("every workflow job runs on ubuntu-24.04", () => {
    const files = readdirSync(".github/workflows").filter((f) => /\.ya?ml$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const runsOn = [...readFileSync(join(".github/workflows", f), "utf8").matchAll(/^\s*runs-on:\s*(.+)$/gm)];
      expect(runsOn.length, f).toBeGreaterThan(0);
      for (const m of runsOn) expect(m[1]?.trim(), f).toBe("ubuntu-24.04");
    }
  });

  describe.skipIf(process.platform === "win32")("the CI guard step itself", () => {
    const guard = ciStepScript("Runner pin");
    const runGuard = (workflow: string) => {
      const dir = mkdtempSync(join(tmpdir(), "belvoir-runner-"));
      try {
        mkdirSync(join(dir, ".github/workflows"), { recursive: true });
        writeFileSync(join(dir, ".github/workflows/x.yml"), workflow);
        return spawnSync("bash", ["-e", "-c", guard], { cwd: dir, encoding: "utf8" }).status;
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    };

    it("passes a pinned image", () => {
      expect(runGuard("jobs:\n  a:\n    runs-on: ubuntu-24.04\n")).toBe(0);
    });

    it.each(["runs-on: ubuntu-latest", "runs-on: [ubuntu-latest]", "runs-on: windows-latest", "runs-on: macos-latest"])(
      "fails on %s",
      (line) => {
        expect(runGuard(`jobs:\n  a:\n    ${line}\n`)).toBe(1);
      },
    );
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
