/**
 * One intake run (D-1): fetch each selected Source in turn, parse, dedupe,
 * write new items create-only to <out>/content/source-items/, write changed
 * Source files to <out>/content/sources/, and a fixed-format <out>/summary.txt.
 * Nothing is published and nothing outside <out> is written.
 */
import { lstatSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { isMap, parseDocument, Scalar } from "yaml";
import { isArtifactPath, normaliseUrl, SOURCE_INTAKE_FIELDS, sourceSchema } from "../sources/schema.ts";
import { type FetchDeps, fetchFeed } from "./fetch.ts";
import { DROP_REASONS, parseFeed } from "./parse/parse.ts";
import { writeItem } from "./write.ts";

export interface RegistryFile {
  id: string;
  text: string;
}
export interface ExistingItem {
  sourceId: string;
  title: string;
  url: string;
  publishedAt: string;
}
export interface RunOptions extends FetchDeps {
  registry: RegistryFile[];
  existing: ExistingItem[];
  outDir: string;
  fetchedAt: string;
  env: Record<string, string | undefined>;
}
export interface RunResult {
  exitCode: number;
  summary: string;
}

/** F5-31 (D-9, Q-14): the only Sources ever fetched. */
export function isFetchable(s: Record<string, unknown>): boolean {
  return (
    s["status"] === "active" &&
    s["demo"] === false &&
    (s["feedType"] === "rss" || s["feedType"] === "atom") &&
    typeof s["feedUrl"] === "string" &&
    s["rights"] !== "none"
  );
}

/** F5-40: every path under the output tree matches the allowlist; regular files only. */
export function artifactTreeProblems(outDir: string): string[] {
  const problems: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      const rel = relative(outDir, abs).split(sep).join("/");
      const st = lstatSync(abs);
      if (st.isDirectory() && ["content", "content/source-items", "content/sources"].includes(rel)) walk(abs);
      else if (!st.isFile() || !isArtifactPath(rel)) problems.push(rel);
    }
  };
  walk(outDir);
  return problems;
}

/** F5-33: never re-fold long lines, so a rewrite changes only the intake fields. */
export const YAML_OUT = { lineWidth: 0 } as const;

const fallbackKey = (sourceId: string, title: string, publishedAt: string) =>
  `${sourceId}\u0000${title}\u0000${publishedAt}`;

/**
 * F5-28: any environment setting that disables verification or swaps the trust
 * store (NODE_EXTRA_CA_CERTS, or --use-openssl-ca / --use-system-ca in NODE_OPTIONS).
 */
export function tlsOverridden(env: Readonly<Record<string, string | undefined>>): boolean {
  if (env["NODE_TLS_REJECT_UNAUTHORIZED"] !== undefined) return true;
  if (env["NODE_EXTRA_CA_CERTS"] !== undefined) return true;
  const opts = env["NODE_OPTIONS"] ?? "";
  return /(^|\s)--use-(openssl|system)-ca(?=\s|=|$)/.test(opts);
}

/** F5-26: the URLs a run may fetch: every feedUrl of the Sources selected for it. */
export function allowedFeedUrls(selected: readonly Record<string, unknown>[]): ReadonlySet<string> {
  return new Set(selected.filter(isFetchable).map((d) => String(d["feedUrl"])));
}

export async function runIntake(o: RunOptions): Promise<RunResult> {
  // F5-28: verification can't be turned off; stop before any request.
  if (tlsOverridden(o.env)) {
    mkdirSync(o.outDir, { recursive: true });
    writeFileSync(join(o.outDir, "summary.txt"), "run tls-override\n");
    return { exitCode: 1, summary: "run tls-override\n" };
  }
  const queue = join(o.outDir, "content", "source-items");
  const sourcesOut = join(o.outDir, "content", "sources");
  mkdirSync(queue, { recursive: true });
  mkdirSync(sourcesOut, { recursive: true });

  const seenUrls = new Set<string>();
  const seenKeys = new Set<string>();
  for (const e of o.existing) {
    try {
      seenUrls.add(normaliseUrl(e.url));
    } catch {
      // An unparseable committed url can't match a valid new one.
    }
    seenKeys.add(fallbackKey(e.sourceId, e.title, e.publishedAt));
  }

  const failures: string[] = [];
  const drops: string[] = [];
  const itemLines: string[] = [];
  let selected = 0;
  let ok = 0;
  let invalid = 0;
  let duplicates = 0;
  const sorted = [...o.registry].sort((a, b) => (a.id < b.id ? -1 : 1));
  const runList: {
    file: (typeof sorted)[number];
    doc: ReturnType<typeof parseDocument>;
    data: Record<string, unknown>;
  }[] = [];
  for (const file of sorted) {
    const doc = parseDocument(file.text, { version: "1.2", schema: "core", uniqueKeys: true });
    const data = doc.errors.length === 0 ? (doc.toJS() as Record<string, unknown>) : undefined;
    if (!data || !sourceSchema.safeParse(data).success) {
      invalid += 1;
      continue;
    }
    if (isFetchable(data)) runList.push({ file, doc, data });
  }
  // F5-26: the allowed set is every feedUrl selected for this run; a redirect may
  // only land on one of them. Paused, retired, rights-none or invalid Sources' URLs
  // are never in it.
  const allowed = allowedFeedUrls(runList.map((r) => r.data));
  for (const { file, doc, data } of runList) {
    selected += 1;
    const feedUrl = String(data["feedUrl"]);
    // One request per source, one after another (F5-30).
    const fetched = await fetchFeed(feedUrl, allowed, o);
    const parsed = fetched.ok
      ? parseFeed(fetched.body, {
          source: { id: file.id, rights: String(data["rights"]) },
          fetchedAt: o.fetchedAt,
          contentType: fetched.contentType,
        })
      : undefined;
    const code = !fetched.ok ? fetched.code : parsed && !parsed.ok ? parsed.code : undefined;
    if (!isMap(doc.contents)) continue;
    if (code !== undefined) {
      // F5-33: record the failure; nothing else in the file changes.
      const prev = Number(data["consecutiveFailures"] ?? 0);
      const count = Number.isInteger(prev) && prev > 0 ? prev + 1 : 1;
      const at = new Scalar(o.fetchedAt);
      at.type = Scalar.QUOTE_DOUBLE;
      doc.set("lastError", code);
      doc.set("lastErrorAt", at);
      doc.set("consecutiveFailures", count);
      writeFileSync(join(sourcesOut, `${file.id}.yaml`), doc.toString(YAML_OUT));
      failures.push(`${file.id} ${code} x${count}`);
      continue;
    }
    ok += 1;
    if (SOURCE_INTAKE_FIELDS.some((k) => data[k] !== undefined)) {
      for (const k of SOURCE_INTAKE_FIELDS) doc.delete(k);
      writeFileSync(join(sourcesOut, `${file.id}.yaml`), doc.toString(YAML_OUT));
    }
    if (!parsed?.ok) continue;
    const dropped: Record<string, number> = { ...parsed.dropped };
    for (const item of parsed.items) {
      const norm = normaliseUrl(item.url);
      const key = fallbackKey(item.sourceId, item.title, item.publishedAt);
      if (seenUrls.has(norm) || seenKeys.has(key)) {
        dropped["duplicate"] = (dropped["duplicate"] ?? 0) + 1;
        duplicates += 1;
        continue;
      }
      const outcome = writeItem(queue, item);
      if (outcome !== "written") {
        dropped["duplicate"] = (dropped["duplicate"] ?? 0) + 1;
        continue;
      }
      seenUrls.add(norm);
      seenKeys.add(key);
      // F5-50: the full WHATWG hostname (ASCII form), never shortened.
      itemLines.push(`${item.id} ${new URL(item.url).hostname}`);
    }
    for (const reason of DROP_REASONS) if (dropped[reason]) drops.push(`${file.id} ${reason} ${dropped[reason]}`);
  }

  // F5-35: ids, codes, counts and hosts only.
  const lines = [
    `run sources=${selected} ok=${ok} failed=${failures.length} new-items=${itemLines.length} duplicates=${duplicates} invalid-sources=${invalid}`,
    "[failures]",
    ...failures,
    "[dropped]",
    ...drops,
    "[items]",
    ...itemLines,
  ];
  const summary = `${lines.join("\n")}\n`;
  writeFileSync(join(o.outDir, "summary.txt"), summary);
  const bad = artifactTreeProblems(o.outDir);
  if (bad.length > 0) return { exitCode: 1, summary: `${summary}run path-check-failed ${bad.length}\n` };
  return { exitCode: 0, summary };
}
