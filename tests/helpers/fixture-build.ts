/**
 * Build a temporary copy of the repo with a chosen content/ folder (F3-31).
 * The copy has src/, public/ and the config files; node_modules links each package.
 * Content comes from one or more folders copied in order, so a negative
 * overlay replaces the file with the same relative path. Astro is run
 * directly (no npm postbuild), so a build failure is the content check's.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

const REPO = resolve(".");
const COPY = [
  "src",
  "public",
  "astro.config.mjs",
  "markdoc.config.ts",
  "tsconfig.json",
  "package.json",
  "keystatic.config.ts",
];

export interface Site {
  dir: string;
  dist: string;
  cleanup: () => void;
}

export function makeSite(contentDirs: readonly string[]): Site {
  const dir = mkdtempSync(join(tmpdir(), "belvoir-fixture-"));
  for (const p of COPY) cpSync(join(REPO, p), join(dir, p), { recursive: true });
  // Link each package, not node_modules itself: Astro and Vite keep caches in
  // node_modules/.astro and .vite, which concurrent fixture builds (and the real
  // build) must not share.
  mkdirSync(join(dir, "node_modules"));
  for (const n of readdirSync(join(REPO, "node_modules"))) {
    if (n.startsWith(".")) continue;
    symlinkSync(join(REPO, "node_modules", n), join(dir, "node_modules", n));
  }
  for (const c of contentDirs) cpSync(resolve(c), join(dir, "content"), { recursive: true });
  return { dir, dist: join(dir, "dist"), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export interface BuildResult {
  status: number | null;
  output: string;
}

export function astroBuild(site: Site, env: Record<string, string> = {}, nodeArgs: string[] = []): BuildResult {
  const r = spawnSync(process.execPath, [...nodeArgs, join(REPO, "node_modules/astro/bin/astro.mjs"), "build"], {
    cwd: site.dir,
    env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1", ...env },
    encoding: "utf8",
    timeout: 120_000,
  });
  return { status: r.status, output: `${r.stdout}\n${r.stderr}` };
}

export function walkFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walkFiles(p) : [p];
  });
}

/** relative path -> sha256 of every file under dir */
export function hashTree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of walkFiles(dir).sort())
    out[relative(dir, f)] = createHash("sha256").update(readFileSync(f)).digest("hex");
  return out;
}

export const FAKE_CLOCK = join(REPO, "tests/helpers/fake-clock.mjs");
