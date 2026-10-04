// F2-38: checks committed visual baselines against tests/visual/BASELINES.sha256.
// Pure Node (no network, no deps). The CLI is scripts/check-visual-baselines.ts.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const SCREENSHOT_DIR = "tests/visual/__screenshots__/";
export const MANIFEST = "tests/visual/BASELINES.sha256";

/** A baseline the guard tracks: a `*-linux.png` under the screenshot folder. */
export const isBaseline = (path: string): boolean => path.startsWith(SCREENSHOT_DIR) && path.endsWith("-linux.png");

export interface ManifestEntry {
  hash: string;
  path: string;
  line: number;
}

/** sha256sum lines: `<64 hex>  <path>` (or ` *<path>`). `#` comments and blank lines are skipped. */
const LINE = /^([0-9a-f]{64}) [ *](\S(?:.*\S)?)$/;

export function parseManifest(text: string): { entries: ManifestEntry[]; errors: string[] } {
  const entries: ManifestEntry[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  text.split("\n").forEach((raw, i) => {
    const line = i + 1;
    const s = raw.replace(/\r$/, "");
    if (s.trim() === "" || s.startsWith("#")) return;
    const m = LINE.exec(s);
    if (!m) {
      errors.push(`${MANIFEST}:${line}: malformed line (expected "<sha256>  <path>")`);
      return;
    }
    const [, hash = "", path = ""] = m;
    if (!isBaseline(path) || path.split("/").includes("..")) {
      errors.push(`${MANIFEST}:${line}: ${path} is not a *-linux.png under ${SCREENSHOT_DIR}`);
      return;
    }
    if (seen.has(path)) {
      errors.push(`${MANIFEST}:${line}: ${path} is listed more than once`);
      return;
    }
    seen.add(path);
    entries.push({ hash, path, line });
  });
  return { entries, errors };
}

export const sha256File = (file: string): string => createHash("sha256").update(readFileSync(file)).digest("hex");

/**
 * Problems with the baselines in `files` (repo-relative paths, e.g. from `git ls-files`)
 * under `root`: any file under SCREENSHOT_DIR that is not a `*-linux.png` (a -darwin.png,
 * -win32.png or anything else), hash mismatches, unlisted baselines and listed files that
 * are not committed. Empty when everything matches, or when there is no manifest and no baseline.
 */
export function checkBaselines(root: string, files: readonly string[]): string[] {
  const baselines = files.filter(isBaseline).sort();
  const strays = files
    .filter((p) => p.startsWith(SCREENSHOT_DIR) && !isBaseline(p))
    .sort()
    .map((p) => `${p} is not a *-linux.png baseline (only CI-generated *-linux.png files belong in ${SCREENSHOT_DIR})`);
  const manifestPath = join(root, MANIFEST);
  if (!existsSync(manifestPath)) {
    return [...strays, ...baselines.map((p) => `${p} is not listed in ${MANIFEST} (the manifest is missing)`)];
  }
  const parsed = parseManifest(readFileSync(manifestPath, "utf8"));
  const entries = parsed.entries;
  const errors = [...strays, ...parsed.errors];
  const listed = new Map(entries.map((e) => [e.path, e]));
  const present = new Set(baselines);
  for (const p of baselines) {
    const entry = listed.get(p);
    if (!entry) {
      errors.push(`${p} is not listed in ${MANIFEST}`);
      continue;
    }
    const file = join(root, p);
    if (!existsSync(file)) {
      errors.push(`${p} is tracked but missing on disk`);
      continue;
    }
    const actual = sha256File(file);
    if (actual !== entry.hash) errors.push(`${p}: sha256 ${actual} does not match ${MANIFEST}:${entry.line}`);
  }
  for (const e of entries) {
    if (!present.has(e.path)) errors.push(`${e.path} is listed in ${MANIFEST}:${e.line} but not committed`);
  }
  return errors;
}

/**
 * Warnings for `*-linux.png` files on disk under SCREENSHOT_DIR (below `root`) that are not
 * in `tracked` (e.g. local renders on a developer machine). They are ignored by the check
 * and must never be committed: baselines come only from the CI artifact.
 */
export function untrackedBaselineWarnings(root: string, tracked: readonly string[]): string[] {
  const dir = join(root, SCREENSHOT_DIR);
  if (!existsSync(dir)) return [];
  const known = new Set(tracked);
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => `${SCREENSHOT_DIR}${relative(dir, join(d.parentPath, d.name)).split(sep).join("/")}`)
    .filter((p) => isBaseline(p) && !known.has(p))
    .sort()
    .map(
      (p) =>
        `${p} is untracked and ignored by this check (a local render?). Never commit it: baselines come only from the CI "visual-baselines" artifact.`,
    );
}

export interface ManifestSource {
  run: string;
  artifact: string;
  commit: string;
}

const USAGE = "usage: npm run visual:manifest -- --run <run id> --artifact <artifact id> --commit <40-hex sha>";

/** Parses and validates `--run <id> --artifact <id> --commit <sha>` (also `--flag=value`). */
export function parseManifestArgs(argv: readonly string[]): { source?: ManifestSource; errors: string[] } {
  const values = new Map<string, string>();
  const errors: string[] = [];
  const names = ["run", "artifact", "commit"];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    const m = /^--([a-z]+)(?:=(.*))?$/.exec(arg);
    const name = m?.[1] ?? "";
    if (!m || !names.includes(name)) {
      errors.push(`unknown argument ${JSON.stringify(arg)}`);
      continue;
    }
    let value = m[2];
    if (value === undefined) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        errors.push(`--${name} needs a value`);
        continue;
      }
      value = next;
      i++;
    }
    if (values.has(name)) errors.push(`--${name} is given more than once`);
    values.set(name, value);
  }
  const run = values.get("run");
  const artifact = values.get("artifact");
  const commit = values.get("commit");
  for (const [name, value] of [
    ["run", run],
    ["artifact", artifact],
  ] as const) {
    if (value === undefined) errors.push(`--${name} is required`);
    else if (!/^[1-9][0-9]*$/.test(value)) errors.push(`--${name} must be a numeric id, got ${JSON.stringify(value)}`);
  }
  if (commit === undefined) errors.push("--commit is required");
  else if (!/^[0-9a-f]{40}$/.test(commit)) {
    errors.push(`--commit must be a full 40-character lowercase hex sha, got ${JSON.stringify(commit)}`);
  }
  if (errors.length > 0 || run === undefined || artifact === undefined || commit === undefined) {
    return { errors: [...errors, USAGE] };
  }
  return { source: { run, artifact, commit }, errors };
}

/** The manifest header (the `#` lines), naming where the baselines came from. */
export const manifestHeader = ({ run, artifact, commit }: ManifestSource): string =>
  [
    "# F2-38 visual baselines (sha256sum format; check with `npm run check:visual-baselines`).",
    `# Source: GitHub Actions run ${run}, artifact "visual-baselines" (id ${artifact}),`,
    `# built from commit ${commit} on runner ubuntu-24.04.`,
    "# Written by `npm run visual:manifest`. To update: download the artifact from a new CI",
    "# run, copy the files into tests/visual/__screenshots__/<project>/, `git add -f` them,",
    "# then run `npm run visual:manifest -- --run <run id> --artifact <artifact id> --commit <sha>`.",
  ].join("\n");

/**
 * The full manifest text for the `*-linux.png` baselines in `files` (repo-relative, e.g.
 * from `git ls-files`) under `root`: the header, then `<sha256>  <path>` lines sorted by
 * path (byte order, like `LC_ALL=C sort`), with a trailing newline. Throws when there
 * is no baseline, a stray non-baseline file, or a tracked baseline missing on disk.
 */
export function buildManifest(root: string, files: readonly string[], source: ManifestSource): string {
  const strays = files.filter((p) => p.startsWith(SCREENSHOT_DIR) && !isBaseline(p));
  if (strays.length > 0) throw new Error(`not *-linux.png baselines: ${strays.sort().join(", ")}`);
  const baselines = [...new Set(files.filter(isBaseline))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (baselines.length === 0) throw new Error(`no tracked *-linux.png baselines under ${SCREENSHOT_DIR}`);
  const lines = baselines.map((p) => {
    const file = join(root, p);
    if (!existsSync(file)) throw new Error(`${p} is tracked but missing on disk`);
    return `${sha256File(file)}  ${p}`;
  });
  return `${manifestHeader(source)}\n${lines.join("\n")}\n`;
}
