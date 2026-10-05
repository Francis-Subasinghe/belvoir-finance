/**
 * F3 content rules (CF-01 to CF-05, F3-14 to F3-26, F3-43 to F3-47).
 *
 * `checkContentRules(dirs)` reads content/ itself, validates every entry with
 * the same Zod schemas Astro uses (src/content/schemas.ts), then applies the
 * rules that need more than one entry: references, unpublished targets, demo
 * propagation and ids. It is THE function the build (astro.config.mjs, the
 * `belvoir-content-rules` integration), `npm run check:content` and the tests
 * call (F3-31).
 *
 * YAML is read with the YAML 1.2 core schema, so dates stay the strings the
 * author wrote and the strict calendar-date check sees `2026-02-30` as written
 * (F3-23). Nothing here reads the clock, so the result never depends on the
 * build date or time zone (F3-24, F3-25).
 *
 * Imports carry .ts extensions so Node runs this file directly (check:content).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { parseDocument } from "yaml";
import { COLLECTIONS, type CollectionName, SLUG_PATTERN } from "../content/schemas.ts";

export type Severity = "error" | "warning";

export interface RuleProblem {
  severity: Severity;
  /** Path of the file, relative to the working directory (or the collection and id). */
  file: string;
  /** Field path such as `sources[1].source`; empty for whole-entry problems. */
  field: string;
  /** Short rule id, e.g. `ref-missing`. */
  rule: string;
  message: string;
}

export interface LoadedEntry {
  collection: CollectionName;
  id: string;
  file: string;
  /** Raw data as written (strings for dates). */
  raw: Record<string, unknown>;
  /** Parsed data, when the schema accepted it. */
  data?: Record<string, unknown> | undefined;
}

export interface ContentReport {
  entries: LoadedEntry[];
  problems: RuleProblem[];
  errors: RuleProblem[];
  warnings: RuleProblem[];
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** `["sources", 1, "source"]` -> `sources[1].source` */
export function fieldPath(path: readonly PropertyKey[]): string {
  return path.map((p, i) => (typeof p === "number" ? `[${p}]` : `${i === 0 ? "" : "."}${String(p)}`)).join("");
}

export function formatProblem(p: RuleProblem): string {
  const where = p.field ? `${p.file}: ${p.field}` : p.file;
  return `${p.severity === "warning" ? "warning: " : ""}${where}: ${p.message} [${p.rule}]`;
}

function parseYaml(text: string): { data?: unknown; error?: string } {
  const doc = parseDocument(text, { version: "1.2", schema: "core", uniqueKeys: true });
  if (doc.errors.length > 0) return { error: doc.errors.map((e) => e.message.split("\n")[0]).join("; ") };
  return { data: doc.toJS() };
}

function readEntryData(file: string, ext: string): { data?: unknown; error?: string } {
  const text = readFileSync(file, "utf8");
  if (ext === ".json") {
    try {
      return { data: JSON.parse(text) };
    } catch (e) {
      return { error: `invalid JSON: ${(e as Error).message}` };
    }
  }
  if (ext === ".mdoc") {
    const fm = FRONTMATTER.exec(text);
    if (!fm) return { error: "no YAML frontmatter (--- ... ---) at the top of the file" };
    return parseYaml(fm[1] ?? "");
  }
  return parseYaml(text);
}

/**
 * Collect the files of every collection. Later `dirs` override files at the
 * same relative path in earlier ones (tests layer a fixture over a base set).
 */
function collectFiles(
  dirs: readonly string[],
): Map<string, { collection: CollectionName; name: string; file: string }> {
  const out = new Map<string, { collection: CollectionName; name: string; file: string }>();
  for (const dir of dirs) {
    for (const [collection, c] of Object.entries(COLLECTIONS) as [
      CollectionName,
      (typeof COLLECTIONS)[CollectionName],
    ][]) {
      const cdir = join(dir, c.dir);
      if (!existsSync(cdir)) continue;
      for (const name of readdirSync(cdir)) {
        const file = join(cdir, name);
        if (statSync(file).isDirectory()) continue;
        out.set(`${c.dir}/${name}`, { collection, name, file });
      }
    }
  }
  return out;
}

const issueMessage = (issue: { code: string; message: string; keys?: string[] }): string => {
  if (issue.code === "unrecognized_keys" && issue.keys?.includes("slug")) {
    return 'a "slug" key is not allowed: Astro would use it as the entry id, so ids come from file names only';
  }
  return issue.message;
};

/** References checked by CF-01 (F3-15). Story `pillars` is an enum, not a reference (F3-44). */
interface RefSpec {
  from: CollectionName;
  field: string;
  to: CollectionName;
  /** Read the referenced ids (with their field paths) from parsed data. */
  ids: (d: Record<string, unknown>) => { path: string; id: string }[];
}
const one = (field: string) => (d: Record<string, unknown>) =>
  typeof d[field] === "string" ? [{ path: field, id: d[field] as string }] : [];
const many = (field: string) => (d: Record<string, unknown>) =>
  Array.isArray(d[field]) ? (d[field] as unknown[]).map((id, i) => ({ path: `${field}[${i}]`, id: String(id) })) : [];

export const REFERENCES: readonly RefSpec[] = [
  { from: "stories", field: "topics", to: "topics", ids: many("topics") },
  { from: "stories", field: "author", to: "people", ids: one("author") },
  { from: "stories", field: "reviewer", to: "people", ids: one("reviewer") },
  {
    from: "stories",
    field: "sources[].source",
    to: "sources",
    ids: (d) =>
      Array.isArray(d["sources"])
        ? (d["sources"] as { source?: unknown }[]).map((s, i) => ({
            path: `sources[${i}].source`,
            id: String(s.source),
          }))
        : [],
  },
  { from: "stories", field: "relatedStories", to: "stories", ids: many("relatedStories") },
  { from: "stories", field: "relatedTools", to: "tools", ids: many("relatedTools") },
  { from: "topics", field: "readingPath", to: "stories", ids: many("readingPath") },
  { from: "topics", field: "featuredTool", to: "tools", ids: one("featuredTool") },
  { from: "tools", field: "reviewer", to: "people", ids: one("reviewer") },
  { from: "tools", field: "sourceRecord", to: "sources", ids: one("sourceRecord") },
  { from: "sources", field: "owner", to: "people", ids: one("owner") },
];

export function checkContentRules(dirs: readonly string[] | string = "content"): ContentReport {
  const roots = typeof dirs === "string" ? [dirs] : dirs;
  const problems: RuleProblem[] = [];
  const entries: LoadedEntry[] = [];
  const add = (severity: Severity, file: string, field: string, rule: string, message: string) =>
    problems.push({ severity, file, field, rule, message });

  // ---- files, ids and per-entry schemas
  const seen = new Map<string, string>(); // collection + lower-cased id -> file
  for (const { collection, name, file: abs } of collectFiles(roots).values()) {
    const c = COLLECTIONS[collection];
    const file = relative(process.cwd(), abs) || abs;
    const ext = extname(name);
    if (ext !== c.ext) {
      // .mdx is reported by the Markdoc check (F1-11); anything else would be silently ignored by Astro.
      if (ext.toLowerCase() !== ".mdx") {
        add(
          "error",
          file,
          "",
          "unexpected-file",
          `only ${c.ext} files belong in content/${c.dir}/ (Astro would ignore this file)`,
        );
      }
      continue;
    }
    const id = name.slice(0, -ext.length);
    if (!SLUG_PATTERN.test(id)) {
      add(
        "error",
        file,
        "",
        "id-invalid",
        `the file name "${id}" must be a lowercase slug (a-z, 0-9 and single hyphens); it is the entry id`,
      );
    }
    const key = `${collection}/${id.toLowerCase()}`;
    const other = seen.get(key);
    if (other) {
      add(
        "error",
        file,
        "",
        "id-duplicate",
        `the id "${id.toLowerCase()}" is also used by ${other}; every id must be unique`,
      );
    } else {
      seen.set(key, file);
    }
    const read = readEntryData(abs, ext);
    if (read.error !== undefined || typeof read.data !== "object" || read.data === null || Array.isArray(read.data)) {
      add("error", file, "", "parse", read.error ?? "the entry must be a mapping of fields");
      continue;
    }
    const raw = read.data as Record<string, unknown>;
    const parsed = c.schema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        add("error", file, fieldPath(issue.path), "schema", issueMessage(issue as never));
      }
    }
    entries.push({
      collection,
      id,
      file,
      raw,
      data: parsed.success ? (parsed.data as Record<string, unknown>) : undefined,
    });
  }

  // ---- cross-entry rules
  const byCollection = new Map<CollectionName, Map<string, LoadedEntry>>();
  for (const e of entries) {
    if (!byCollection.has(e.collection)) byCollection.set(e.collection, new Map());
    byCollection.get(e.collection)?.set(e.id, e);
  }
  const get = (c: CollectionName, id: string) => byCollection.get(c)?.get(id);
  const label = (c: CollectionName) => COLLECTIONS[c].label;
  const isPublished = (e: LoadedEntry | undefined) => e?.raw["status"] === "published";

  for (const spec of REFERENCES) {
    for (const e of entries.filter((x) => x.collection === spec.from)) {
      // References are read from the parsed data when the entry is valid, else from what was written.
      const d = e.data ?? e.raw;
      for (const { path, id } of spec.ids(d)) {
        const target = get(spec.to, id);
        if (!target) {
          const elsewhere = (Object.keys(COLLECTIONS) as CollectionName[]).find((c) => c !== spec.to && get(c, id));
          add(
            "error",
            e.file,
            path,
            elsewhere ? "ref-wrong-collection" : "ref-missing",
            elsewhere
              ? `"${id}" is a ${label(elsewhere)}, not a ${label(spec.to)}`
              : `no ${label(spec.to)} with id "${id}" (content/${COLLECTIONS[spec.to].dir}/${id}${COLLECTIONS[spec.to].ext})`,
          );
          continue;
        }
        // F3-16 (Q-3): a published page pointing at an unpublished story warns; the target is left out.
        const referrerIsPublic = spec.from === "topics" || isPublished(e);
        if (spec.to === "stories" && referrerIsPublic && !isPublished(target)) {
          add(
            "warning",
            e.file,
            path,
            "ref-unpublished",
            `"${id}" is not published (status: ${String(target.raw["status"])}), so it is left out of the page`,
          );
        }
      }
    }
  }

  // F3-20 / F3-21 / F3-34: placeholder people and sources never front real content.
  for (const s of entries.filter((x) => x.collection === "stories" && x.data)) {
    const d = s.data as Record<string, unknown>;
    for (const field of ["author", "reviewer"] as const) {
      const id = d[field];
      const person = typeof id === "string" ? get("people", id) : undefined;
      if (person && person.raw["demo"] === true && d["demo"] !== true) {
        add(
          "error",
          s.file,
          field,
          "demo-person",
          `"${String(id)}" is a placeholder (demo) person, so this story must set demo: true`,
        );
      }
    }
    const sources = Array.isArray(d["sources"]) ? (d["sources"] as { source: string }[]) : [];
    sources.forEach((cite, i) => {
      const src = get("sources", cite.source);
      if (!src) return;
      if (src.raw["demo"] === true && d["demo"] !== true) {
        add(
          "error",
          s.file,
          `sources[${i}].source`,
          "demo-source",
          `"${cite.source}" is a placeholder (demo) source, so this story must set demo: true`,
        );
      }
      if (d["demo"] === true && src.raw["demo"] !== true) {
        add(
          "error",
          s.file,
          `sources[${i}].source`,
          "demo-source",
          `until F5, demo stories cite only labelled placeholder (demo) sources; "${cite.source}" is not one`,
        );
      }
    });
  }

  const errors = problems.filter((p) => p.severity === "error");
  const warnings = problems.filter((p) => p.severity === "warning");
  return { entries, problems, errors, warnings };
}
