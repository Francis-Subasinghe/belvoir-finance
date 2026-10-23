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
import { isAlias, visit } from "yaml";
import { parseDocument } from "yaml";
// F5-51: every schema, cap and grammar comes from Forge's one module (static import, so a
// missing or renamed export fails typecheck and the import can't start without it).
import {
  ARTIFACT_LIMITS,
  ITEM_ID_PATTERN,
  SOURCE_INTAKE_FIELDS,
  readSourceYaml,
  sourceChangeProblems,
  summaryProblems,
  validateSourceItemText,
  validateSourceText,
} from "../src/lib/sources/schema.ts";
import {
  ArtifactError,
  capOf,
  decodeText,
  isArtifactDir,
  kindOf,
  readArtifact,
  readCentralDirectory,
  type ArtifactEntry,
} from "./intake-artifact.ts";

/** A zip bigger than this can't hold a queue within ARTIFACT_LIMITS (8 MiB + headers). */
export const ZIP_MAX_BYTES = 10 * 1024 * 1024;

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
  const re = new RegExp(`^(?:${SOURCE_INTAKE_FIELDS.join("|")}):.*\\n?`, "gm");
  return yamlText.replace(re, "");
}

/** Kept on top of readSourceYaml: a Source written by intake never needs an anchor or alias. */
function hasAlias(text: string): boolean {
  let found = false;
  visit(parseDocument(text, { version: "1.2", schema: "core" }), {
    Alias() {
      found = true;
      return visit.BREAK;
    },
    Node(_k, n) {
      if (isAlias(n) || (n as { anchor?: string }).anchor) {
        found = true;
        return visit.BREAK;
      }
      return undefined;
    },
  });
  return found;
}

export interface CheckOptions {
  /** Where the committed Sources live (default `<repo>/content/sources`; the fixture registry for verify). */
  sourcesDir?: string;
}

/**
 * Check every queue entry against the schemas and the committed tree. Returns the plan;
 * throws ImportError listing every problem found (not just the first).
 */
export function checkQueue(entries: ArtifactEntry[], repo: string, opts: CheckOptions = {}): Plan {
  const sourcesDir = opts.sourcesDir ?? join(repo, "content/sources");
  const items: { id: string; url: string }[] = [];
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
      summary = text;
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
      const id = e.name.slice("content/source-items/".length, -".json".length);
      if (!ITEM_ID_PATTERN.test(id)) {
        problems.push(`item-id: ${e.name} is not an ITEM_ID_PATTERN id`);
        continue;
      }
      const r = validateSourceItemText(text);
      if (!r.ok) {
        problems.push(...r.problems.map((b) => `item-schema: ${e.name}: ${b}`));
        continue;
      }
      items.push({ id, url: String(r.data["url"]) });
      const sourceId = (value as Record<string, unknown>)["sourceId"];
      if (typeof sourceId === "string") {
        const src = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sourceId)
          ? lstatOrNull(join(sourcesDir, `${sourceId}.yaml`))
          : null;
        if (!src?.isFile())
          problems.push(
            `item-source: ${e.name} names a source that is not in ${sourcesDir === join(repo, "content/sources") ? "content/sources/" : "the registry"}`,
          );
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
    const sourceTarget = join(sourcesDir, e.name.slice("content/sources/".length));
    const committedSt = lstatOrNull(sourceTarget);
    if (committedSt && !committedSt.isFile()) {
      problems.push(`target-unsafe: ${e.name} is not a regular file in ${sourcesDir}`);
      continue;
    }
    if (readSourceYaml(text).error !== undefined || hasAlias(text)) {
      problems.push(`source-yaml: ${e.name} is not valid YAML (or has duplicate keys or aliases)`);
      continue;
    }
    const r = validateSourceText(text);
    if (!r.ok) {
      problems.push(...r.problems.map((b) => `source-schema: ${e.name}: ${b}`));
      continue;
    }
    if (!committedSt) {
      problems.push(`source-unknown: ${e.name} is not a committed Source (the intake job cannot add one)`);
      continue;
    }
    const committed = readNoFollow(sourceTarget, ARTIFACT_LIMITS.sourceYamlBytes * 4);
    const changed = sourceChangeProblems(committed.toString("utf8"), text);
    if (changed.length > 0) problems.push(`source-changed: ${e.name} changes ${changed.join(", ")}`);
    else if (withoutMutableFields(committed.toString("utf8")) !== withoutMutableFields(text))
      // Same data, other bytes (comments, quoting, order): still refused, so the diff stays reviewable.
      problems.push(`source-changed: ${e.name} rewrites lines other than ${SOURCE_INTAKE_FIELDS.join(", ")}`);
    else if (committed.equals(e.data)) writes.push({ name: e.name, action: "unchanged", data: e.data });
    else writes.push({ name: e.name, action: "update", data: e.data });
  }
  if (summary === undefined) problems.push("summary-missing: the artifact has no summary.txt");
  else problems.push(...summaryProblems(summary, items).map((b) => `summary-format: summary.txt ${b}`));
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
        if (!isArtifactDir(r)) throw new ArtifactError("entry-name", `directory ${JSON.stringify(r)} is not allowed`);
        walk(r);
        continue;
      }
      if (!st.isFile()) throw new ArtifactError("entry-special", `${JSON.stringify(r)} is not a regular file`);
      const kind = kindOf(r);
      if (kind === undefined) throw new ArtifactError("entry-name", `${JSON.stringify(r)} matches no F5-40 pattern`);
      if (out.length >= ARTIFACT_LIMITS.maxEntries)
        throw new ArtifactError("too-many-entries", `more than ${ARTIFACT_LIMITS.maxEntries} files`);
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
  /** verify only: compare Sources against this folder instead of content/sources (the fixture registry). */
  sourcesDir?: string;
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
export async function runImport(opts: ImportOptions): Promise<Plan> {
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
      const central = await readArtifact(zip);
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

    if (opts.sourcesDir !== undefined && !opts.dryRun)
      throw new ImportError("usage", ["a registry other than content/sources is only for verify (dry run)"]);
    const plan = checkQueue(entries, repo, opts.sourcesDir === undefined ? {} : { sourcesDir: opts.sourcesDir });
    for (const w of plan.writes) log(`${w.action.padEnd(9)} ${w.name}`);
    if (!opts.dryRun) applyPlan(plan, repo);
    return plan;
  } finally {
    if (tmp !== undefined) rmSync(tmp, { recursive: true, force: true });
  }
}
