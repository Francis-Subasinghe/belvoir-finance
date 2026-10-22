// F5-51: check a review queue (from the artifact zip or a directory) against the committed
// tree, then copy it into content/. Nothing is written until every entry has passed, and
// nothing from the artifact is ever executed, installed or committed.
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { parse } from "yaml";
import {
  ARTIFACT_DIRS,
  ARTIFACT_LIMITS,
  ArtifactError,
  capOf,
  decodeText,
  kindOf,
  readArtifact,
  readCentralDirectory,
  summaryProblems,
  type ArtifactEntry,
} from "./intake-artifact.ts";
import type { EntryValidators } from "./intake-schema.ts";

/** A zip bigger than this can't hold a queue within ARTIFACT_LIMITS (8 MiB + headers). */
export const ZIP_MAX_BYTES = 10 * 1024 * 1024;
/** F5-33: the only Source fields the intake job may add, change or remove. */
export const MUTABLE_SOURCE_FIELDS = ["lastError", "lastErrorAt", "consecutiveFailures"] as const;

export type Action = "create" | "update" | "unchanged";
export interface PlannedWrite {
  name: string;
  action: Action;
  data: Buffer;
}
export interface Plan {
  writes: PlannedWrite[];
  summary: string;
}

export class ImportError extends Error {
  readonly code: string;
  readonly problems: string[];
  constructor(code: string, problems: string[]) {
    super(`${code}: ${problems.join("; ")}`);
    this.code = code;
    this.problems = problems;
  }
}

const NOFOLLOW = constants.O_NOFOLLOW;

/** lstat-based: true only for a real file (not a symlink) or nothing. */
function lstatOrNull(p: string) {
  try {
    return lstatSync(p);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/** Read a file without following a symlink at the final component. */
function readNoFollow(p: string, max: number): Buffer {
  const fd = openSync(p, constants.O_RDONLY | NOFOLLOW);
  try {
    const st = lstatSync(p);
    if (!st.isFile()) throw new ImportError("not-a-file", [`${p} is not a regular file`]);
    if (st.size > max) throw new ImportError("too-large", [`${p} is ${st.size} bytes, cap ${max}`]);
    return readFileSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** Drop the F5-33 lines so the rest of a Source file can be compared byte for byte. */
export function withoutMutableFields(yamlText: string): string {
  const re = new RegExp(`^(?:${MUTABLE_SOURCE_FIELDS.join("|")}):.*\\n?`, "gm");
  return yamlText.replace(re, "");
}

const parseYaml = (text: string): unknown => parse(text, { uniqueKeys: true, maxAliasCount: 0, prettyErrors: false });

/**
 * Check every queue entry against the schemas and the committed tree. Returns the plan;
 * throws ImportError listing every problem found (not just the first).
 */
export function checkQueue(entries: ArtifactEntry[], repo: string, v: EntryValidators): Plan {
  const problems: string[] = [];
  const writes: PlannedWrite[] = [];
  let summary: string | undefined;
  for (const e of entries) {
    let text: string;
    try {
      text = decodeText(e);
    } catch (err) {
      problems.push((err as Error).message);
      continue;
    }
    const target = join(repo, e.name);
    const existing = lstatOrNull(target);
    if (existing && !existing.isFile()) {
      problems.push(`target-unsafe: ${e.name} exists in the repo and is not a regular file`);
      continue;
    }
    if (e.kind === "summary") {
      const bad = summaryProblems(text);
      if (bad.length > 0) problems.push(...bad.map((b) => `summary-format: ${b}`));
      else summary = text;
      continue;
    }
    if (e.kind === "item") {
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        problems.push(`item-json: ${e.name} is not valid JSON`);
        continue;
      }
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        problems.push(`item-json: ${e.name} is not a JSON object`);
        continue;
      }
      const bad = v.item(value);
      if (bad.length > 0) {
        problems.push(...bad.map((b) => `item-schema: ${e.name}: ${b}`));
        continue;
      }
      const sourceId = (value as Record<string, unknown>)["sourceId"];
      if (typeof sourceId === "string") {
        const src = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sourceId)
          ? lstatOrNull(join(repo, "content/sources", `${sourceId}.yaml`))
          : null;
        if (!src?.isFile()) problems.push(`item-source: ${e.name} names a source that is not in content/sources/`);
      }
      // F5-24: items are create-only. Re-importing the same bytes is a no-op; anything else fails.
      if (existing) {
        if (readNoFollow(target, ARTIFACT_LIMITS.itemJsonBytes * 4).equals(e.data))
          writes.push({ name: e.name, action: "unchanged", data: e.data });
        else problems.push(`item-exists: ${e.name} already exists with different content (items are create-only)`);
      } else writes.push({ name: e.name, action: "create", data: e.data });
      continue;
    }
    // Source YAML: must already be committed; only the F5-33 fields may differ.
    let value: unknown;
    try {
      value = parseYaml(text);
    } catch {
      problems.push(`source-yaml: ${e.name} is not valid YAML (or has duplicate keys or aliases)`);
      continue;
    }
    const bad = v.source(value);
    if (bad.length > 0) {
      problems.push(...bad.map((b) => `source-schema: ${e.name}: ${b}`));
      continue;
    }
    if (!existing) {
      problems.push(`source-unknown: ${e.name} is not a committed Source (the intake job cannot add one)`);
      continue;
    }
    const committed = readNoFollow(target, ARTIFACT_LIMITS.sourceYamlBytes * 4);
    if (committed.equals(e.data)) writes.push({ name: e.name, action: "unchanged", data: e.data });
    else if (withoutMutableFields(committed.toString("utf8")) === withoutMutableFields(text))
      writes.push({ name: e.name, action: "update", data: e.data });
    else problems.push(`source-changed: ${e.name} changes a field other than ${MUTABLE_SOURCE_FIELDS.join(", ")}`);
  }
  if (summary === undefined && !problems.some((p) => p.startsWith("summary-format")))
    problems.push("summary-missing: the artifact has no summary.txt");
  if (problems.length > 0) throw new ImportError("queue-invalid", problems);
  return { writes, summary: summary ?? "" };
}

/**
 * Read a queue directory (the intake output, or the import's own extraction) with lstat:
 * F5-40 names, regular files only, only the two content directories, the same caps.
 */
export function readQueueDir(dir: string): ArtifactEntry[] {
  const out: ArtifactEntry[] = [];
  let total = 0;
  const walk = (rel: string) => {
    for (const name of readdirSync(join(dir, rel)).sort()) {
      const r = rel === "" ? name : `${rel}/${name}`;
      const st = lstatSync(join(dir, r));
      if (st.isSymbolicLink()) throw new ArtifactError("entry-symlink", `${JSON.stringify(r)} is a symlink`);
      if (st.isDirectory()) {
        if (!ARTIFACT_DIRS.includes(`${r}/`))
          throw new ArtifactError("entry-name", `directory ${JSON.stringify(r)} is not allowed`);
        walk(r);
        continue;
      }
      if (!st.isFile()) throw new ArtifactError("entry-special", `${JSON.stringify(r)} is not a regular file`);
      const kind = kindOf(r);
      if (kind === undefined) throw new ArtifactError("entry-name", `${JSON.stringify(r)} matches no F5-40 pattern`);
      if (out.length >= ARTIFACT_LIMITS.entries)
        throw new ArtifactError("too-many-entries", `more than ${ARTIFACT_LIMITS.entries} files`);
      if (st.size > capOf(kind))
        throw new ArtifactError("entry-too-large", `${r} is ${st.size} bytes, cap ${capOf(kind)}`);
      total += st.size;
      if (total > ARTIFACT_LIMITS.totalBytes)
        throw new ArtifactError("total-too-large", `more than ${ARTIFACT_LIMITS.totalBytes} bytes`);
      out.push({ name: r, kind, data: readNoFollow(join(dir, r), capOf(kind)) });
    }
  };
  walk("");
  return out.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** Write create-only (O_EXCL) and never through a symlink. */
function writeExclusive(p: string, data: Buffer) {
  const fd = openSync(p, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o644);
  try {
    writeSync(fd, data);
  } finally {
    closeSync(fd);
  }
}

/** content/, content/source-items/ and content/sources/ must be real directories inside the repo. */
function assertRealDirs(repo: string) {
  const root = realpathSync(repo);
  for (const d of ["content", "content/source-items", "content/sources"]) {
    const st = lstatOrNull(join(repo, d));
    if (!st?.isDirectory() || st.isSymbolicLink() || realpathSync(join(repo, d)) !== join(root, d))
      throw new ImportError("target-unsafe", [`${d} is not a real directory inside the repo`]);
  }
}

/** Copy the planned files into the working tree. Never commits. */
export function applyPlan(plan: Plan, repo: string): void {
  assertRealDirs(repo);
  for (const w of plan.writes) {
    if (w.action === "unchanged") continue;
    const target = join(repo, w.name);
    assertRealDirs(repo);
    if (w.action === "create") {
      writeExclusive(target, w.data);
      continue;
    }
    const st = lstatOrNull(target);
    if (!st?.isFile() || st.nlink !== 1)
      throw new ImportError("target-unsafe", [`${w.name} is no longer a plain regular file`]);
    const tmp = `${target}.intake-${process.pid}.tmp`;
    writeExclusive(tmp, w.data);
    renameSync(tmp, target); // replaces the directory entry; never writes through a link
  }
}

export interface ImportOptions {
  repo: string;
  /** The artifact zip (already on disk), or a queue directory with `fromDir`. */
  zip?: string;
  fromDir?: string;
  dryRun?: boolean;
  log?: (line: string) => void;
}

/** Run `unzip -tq` and zipinfo on the zip as a second, independent parser. */
export function crossCheckWithUnzip(zipPath: string, names: string[]): void {
  const t = spawnSync("unzip", ["-tq", zipPath], { encoding: "utf8" });
  if (t.status !== 0) throw new ArtifactError("zip-inconsistent", `unzip -tq failed (exit ${t.status})`);
  const listing = execFileSync("zipinfo", ["-l", zipPath], { encoding: "latin1" }).split("\n");
  for (const line of listing) if (/^l/.test(line)) throw new ArtifactError("entry-symlink", "zipinfo lists a symlink");
  const theirs = execFileSync("zipinfo", ["-1", zipPath], { encoding: "latin1" }).split("\n").filter(Boolean).sort();
  const ours = [...names].sort();
  if (JSON.stringify(theirs) !== JSON.stringify(ours))
    throw new ArtifactError("zip-inconsistent", "zipinfo and this parser list different entries");
}

/** The whole import (or, with fromDir and dryRun, the pre-upload verify). */
export function runImport(opts: ImportOptions, validators: EntryValidators): Plan {
  const log = opts.log ?? ((l: string) => console.log(l));
  const repo = realpathSync(opts.repo);
  let entries: ArtifactEntry[];
  let tmp: string | undefined;
  try {
    if (opts.zip !== undefined) {
      tmp = mkdtempSync(join(realpathSync(tmpdir()), "intake-import-"));
      if (`${tmp}${sep}`.startsWith(`${repo}${sep}`))
        throw new ImportError("tmp-in-repo", [`${tmp} is inside the repo`]);
      const zip = readNoFollow(opts.zip, ZIP_MAX_BYTES);
      log(`artifact sha256 ${createHash("sha256").update(zip).digest("hex")} (${zip.length} bytes)`);
      const copy = join(tmp, "artifact.zip");
      writeExclusive(copy, zip);
      const central = readArtifact(zip);
      crossCheckWithUnzip(
        copy,
        readCentralDirectory(zip).map((c) => c.name),
      );
      // Write the checked bytes out (never via unzip), then re-read the folder with lstat.
      const out = join(tmp, "queue");
      mkdirSync(join(out, "content/source-items"), { recursive: true });
      mkdirSync(join(out, "content/sources"), { recursive: true });
      for (const e of central) writeExclusive(join(out, e.name), e.data);
      entries = readQueueDir(out);
    } else if (opts.fromDir !== undefined) {
      entries = readQueueDir(opts.fromDir);
    } else throw new ImportError("usage", ["give a zip or a directory"]);

    const plan = checkQueue(entries, repo, validators);
    for (const w of plan.writes) log(`${w.action.padEnd(9)} ${w.name}`);
    if (!opts.dryRun) applyPlan(plan, repo);
    return plan;
  } finally {
    if (tmp !== undefined) rmSync(tmp, { recursive: true, force: true });
  }
}
