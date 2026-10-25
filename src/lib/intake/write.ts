/**
 * F5-24 (D-4, Q-11): one serialiser and safe, create-only writes into the queue.
 * The id never comes from feed text; the path must resolve directly inside
 * the queue; an existing file or symlink is never followed or overwritten.
 */
import { closeSync, constants, lstatSync, openSync, realpathSync, writeSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ITEM_ID_PATTERN } from "../sources/schema.ts";
import type { ParsedItem } from "./parse/parse.ts";

/** JSON in schema key order, 2-space indent, trailing newline. Never YAML, Markdown or front matter. */
export function serialiseItem(item: ParsedItem): string {
  const ordered = {
    sourceId: item.sourceId,
    title: item.title,
    url: item.url,
    publishedAt: item.publishedAt,
    fetchedAt: item.fetchedAt,
    ...(item.excerpt !== undefined ? { excerpt: item.excerpt } : {}),
    status: "queued",
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export type WriteOutcome = "written" | "exists" | "bad-id" | "outside-queue";

export function writeItem(queueDir: string, item: ParsedItem): WriteOutcome {
  if (!ITEM_ID_PATTERN.test(item.id)) return "bad-id";
  const queue = realpathSync(queueDir);
  const target = resolve(queue, `${item.id}.json`);
  if (dirname(target) !== queue || target !== join(queue, `${item.id}.json`)) return "outside-queue";
  try {
    lstatSync(target);
    return "exists";
  } catch {
    // Not there: create it below.
  }
  let fd: number;
  try {
    fd = openSync(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o644);
  } catch {
    return "exists";
  }
  try {
    writeSync(fd, serialiseItem(item));
  } finally {
    closeSync(fd);
  }
  return "written";
}
