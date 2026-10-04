// F2-38: checks committed visual baselines against tests/visual/BASELINES.sha256.
// Pure Node (no network, no deps). The CLI is scripts/check-visual-baselines.ts.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
 * under `root`. Empty when everything matches, or when there is no manifest and no baseline.
 */
export function checkBaselines(root: string, files: readonly string[]): string[] {
  const baselines = files.filter(isBaseline).sort();
  const manifestPath = join(root, MANIFEST);
  if (!existsSync(manifestPath)) {
    return baselines.map((p) => `${p} is not listed in ${MANIFEST} (the manifest is missing)`);
  }
  const { entries, errors } = parseManifest(readFileSync(manifestPath, "utf8"));
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
