/**
 * THE one module for every F5 schema and validator (agreed interface with
 * Launchpad's intake job and artifact import, F5-40 / F5-51). Pure: no I/O.
 *
 * - `sourceSchema`, `sourceItemSchema`: the same Zod schemas Astro and the
 *   content check use (src/content/schemas.ts); `.parse` throws and
 *   `.safeParse` fails on an invalid entry.
 * - `validateSourceItemText`, `validateSourceText`: parse a JSON / YAML file's
 *   text as data and validate it.
 * - `ARTIFACT_PATH_PATTERNS`, `isArtifactPath`, `ARTIFACT_LIMITS`: the F5-40
 *   output allowlist and the F5-51 caps.
 * - `sourceChangeProblems`: F5-33 / F5-51, only the intake fields may differ.
 */
import { parseDocument } from "yaml";
import { LAST_ERROR_PATTERN } from "./rules.ts";
import {
  offsetDateTime,
  lastErrorField,
  RIGHTS,
  SOURCE_INTAKE_FIELDS,
  SOURCE_ITEM_STATUSES,
  sourceItemSchema,
  sourceSchema,
} from "../../content/schemas.ts";

export {
  offsetDateTime,
  lastErrorField,
  RIGHTS,
  SOURCE_INTAKE_FIELDS,
  SOURCE_ITEM_STATUSES,
  sourceItemSchema,
  sourceSchema,
};
export {
  formatUtc,
  isIpLiteralHost,
  isLastError,
  itemTextProblem,
  itemUrlOk,
  LAST_ERROR_CODES,
  LAST_ERROR_MAX,
  LAST_ERROR_PATTERN,
  type LastErrorCode,
  MAX_ITEM_URL_LENGTH,
  normaliseUrl,
  parseOffsetDateTime,
  urlShapeProblem,
} from "./rules.ts";

/** F5-24 (Q-11): an item id, which is also its file name. */
export const ITEM_ID_PATTERN = /^[a-z0-9-]{1,64}$/;

/** F5-40: the only paths an intake artifact may hold (relative, forward slashes). */
export const ARTIFACT_PATH_PATTERNS = [
  /^content\/source-items\/[a-z0-9-]{1,64}\.json$/,
  /^content\/sources\/[a-z0-9]+(?:-[a-z0-9]+)*\.yaml$/,
  /^summary\.txt$/,
] as const;
/** F5-40: the only directories an artifact may hold. */
export const ARTIFACT_DIRS = ["content", "content/source-items", "content/sources"] as const;
export function isArtifactPath(rel: string): boolean {
  return ARTIFACT_PATH_PATTERNS.some((re) => re.test(rel));
}

/** F5-51 (Aegis-confirmed caps). */
export const ARTIFACT_LIMITS = {
  itemJsonBytes: 16 * 1024,
  sourceYamlBytes: 16 * 1024,
  summaryBytes: 256 * 1024,
  maxEntries: 2000,
  totalBytes: 8 * 1024 * 1024,
} as const;

export type Validation = { ok: true; data: Record<string, unknown> } | { ok: false; problems: string[] };

function issues(e: { issues: { path: PropertyKey[]; message: string }[] }): string[] {
  return e.issues.map((i) => `${i.path.map(String).join(".") || "(entry)"}: ${i.message}`);
}

/** Parse a SourceItem JSON file's text as data and validate it. */
export function validateSourceItemText(text: string): Validation {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, problems: ["invalid JSON"] };
  }
  const r = sourceItemSchema.safeParse(raw);
  return r.success ? { ok: true, data: raw as Record<string, unknown> } : { ok: false, problems: issues(r.error) };
}

/** Read Source YAML as data (YAML 1.2 core schema, as the content check does). */
export function readSourceYaml(text: string): { data?: Record<string, unknown>; error?: string } {
  const doc = parseDocument(text, { version: "1.2", schema: "core", uniqueKeys: true });
  if (doc.errors.length > 0) return { error: "invalid YAML" };
  const data = doc.toJS() as unknown;
  if (!data || typeof data !== "object" || Array.isArray(data)) return { error: "not a mapping" };
  return { data: data as Record<string, unknown> };
}

/** Parse a Source YAML file's text as data and validate it. */
export function validateSourceText(text: string): Validation {
  const { data, error } = readSourceYaml(text);
  if (!data) return { ok: false, problems: [error ?? "invalid YAML"] };
  const r = sourceSchema.safeParse(data);
  return r.success ? { ok: true, data } : { ok: false, problems: issues(r.error) };
}

/**
 * F5-33 / F5-51: an artifact Source may differ from the committed file only in
 * lastError, lastErrorAt and consecutiveFailures. Returns the offending keys.
 */
export function sourceChangeProblems(committedText: string, artifactText: string): string[] {
  const a = readSourceYaml(committedText).data;
  const b = readSourceYaml(artifactText).data;
  if (!a || !b) return ["(unreadable)"];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys]
    .filter((k) => !(SOURCE_INTAKE_FIELDS as readonly string[]).includes(k))
    .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .sort();
}

/**
 * F5-34 / F5-35 / F5-50: the run summary grammar. Only source ids, E codes,
 * counts, fixed drop reasons and `<item id> <host>` lines; never a title, URL,
 * path or query.
 */
const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const HOST = "(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)*[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
export const SUMMARY_DROP_REASONS = ["missing-title", "missing-link", "bad-link", "bad-date", "duplicate"] as const;
export const SUMMARY_LINE_PATTERNS = {
  run: /^run (?:tls-override|sources=\d+ ok=\d+ failed=\d+ new-items=\d+ duplicates=\d+ invalid-sources=\d+|path-check-failed \d+)$/,
  header: /^\[(?:failures|dropped|items)\]$/,
  failure: new RegExp(`^${SLUG} (?:${LAST_ERROR_PATTERN.source.slice(4, -2)}) x[1-9]\\d*$`),
  dropped: new RegExp(`^${SLUG} (?:${SUMMARY_DROP_REASONS.join("|")}) [1-9]\\d*$`),
  item: new RegExp(`^[a-z0-9-]{1,64} ${HOST}$`),
} as const;

/**
 * Problems with a summary.txt: any line outside the grammar, a section line in
 * the wrong section, and (when `items` is given) any new item whose line is
 * missing or whose host is not exactly its url's WHATWG hostname (F5-50).
 */
export function summaryProblems(text: string, items?: readonly { id: string; url: string }[]): string[] {
  const problems: string[] = [];
  let section: "run" | "failures" | "dropped" | "items" = "run";
  const lines = text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
  const seen = new Map<string, string>();
  lines.forEach((line, i) => {
    const at = `line ${i + 1}`;
    if (SUMMARY_LINE_PATTERNS.header.test(line)) {
      section = line.slice(1, -1) as typeof section;
      return;
    }
    const ok =
      section === "run"
        ? SUMMARY_LINE_PATTERNS.run.test(line)
        : section === "failures"
          ? SUMMARY_LINE_PATTERNS.failure.test(line)
          : section === "dropped"
            ? SUMMARY_LINE_PATTERNS.dropped.test(line)
            : SUMMARY_LINE_PATTERNS.item.test(line);
    if (!ok) problems.push(`${at}: not a ${section} line`);
    if (ok && section === "items") {
      const [id, host] = line.split(" ") as [string, string];
      seen.set(id, host);
    }
  });
  for (const it of items ?? []) {
    const want = new URL(it.url).hostname;
    const got = seen.get(it.id);
    if (got === undefined) problems.push(`${it.id}: no item line`);
    else if (got !== want) problems.push(`${it.id}: host ${got} is not the full host ${want}`);
  }
  return problems;
}
