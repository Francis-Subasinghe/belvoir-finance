/**
 * F5-12: the pure feed parser. `parseFeed(bytes, { source, fetchedAt })` turns
 * one feed body into SourceItems or one fixed error code. No network, file
 * system, environment, clock or randomness: `fetchedAt` is passed in.
 *
 * XML (D-2): saxes, with any DOCTYPE rejected as `dtd-forbidden` the moment it
 * is seen, so no entity is ever declared or expanded. saxes decodes only the
 * five predefined entities and numeric references; anything else is
 * `malformed-xml`. XInclude is not processed. Any well-formedness error
 * rejects the whole feed (no partial import).
 */
import { createHash } from "node:crypto";
import { SaxesParser, type SaxesTagNS } from "saxes";
import { itemUrlOk, MAX_ITEM_URL_LENGTH, normaliseUrl } from "../../sources/rules.ts";
import { parseAtomDate, parseRssDate } from "./dates.ts";
import { charsetOf, decodeFeed } from "./encoding.ts";
import { INTAKE_LIMITS } from "./limits.ts";
import { cleanText, htmlToText } from "./text.ts";

export type FeedError =
  | "too-large"
  | "dtd-forbidden"
  | "malformed-xml"
  | "bad-encoding"
  | "unsupported-format"
  | "too-many-items"
  | "too-deep";
export const DROP_REASONS = ["missing-title", "missing-link", "bad-link", "bad-date", "duplicate"] as const;
export type DropReason = (typeof DROP_REASONS)[number];

export interface ParseSource {
  id: string;
  rights: string;
}
export interface ParsedItem {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  publishedAt: string;
  fetchedAt: string;
  excerpt?: string;
  status: "queued";
}
export type ParseResult =
  { ok: true; items: ParsedItem[]; dropped: Partial<Record<DropReason, number>> } | { ok: false; code: FeedError };

const ATOM_NS = "http://www.w3.org/2005/Atom";
const EXCERPT_RIGHTS = new Set(["titles-and-short-excerpt", "licensed"]);
const ITEM_ID = /^[a-z0-9-]{1,64}$/;

class Stop extends Error {
  readonly code: FeedError;
  constructor(code: FeedError) {
    super(code);
    this.code = code;
  }
}

type Mode = "text" | "html" | "xhtml";
interface Raw {
  title?: { text: string; mode: Mode };
  link?: string;
  date?: string;
  updated?: string;
  description?: { text: string; mode: Mode };
  content?: { text: string; mode: Mode };
}

/** Q-11: `<sourceId>-<first 12 hex of sha256(normalised url)>`; never from feed text. */
export function itemId(sourceId: string, normalisedUrl: string): string {
  return `${sourceId}-${createHash("sha256").update(normalisedUrl).digest("hex").slice(0, 12)}`;
}

function atomMode(tag: SaxesTagNS): Mode {
  const t = tag.attributes["type"];
  const v = typeof t === "string" ? t : t?.value;
  return v === "html" ? "html" : v === "xhtml" ? "xhtml" : "text";
}

export function parseFeed(
  bytes: Uint8Array,
  opts: { source: ParseSource; fetchedAt: string; contentType?: string | undefined },
): ParseResult {
  try {
    return parseOrThrow(bytes, opts);
  } catch (e) {
    return { ok: false, code: e instanceof Stop ? e.code : "malformed-xml" };
  }
}

function parseOrThrow(
  bytes: Uint8Array,
  { source, fetchedAt, contentType }: { source: ParseSource; fetchedAt: string; contentType?: string | undefined },
): ParseResult {
  // F5-14: the byte cap is checked before any parsing.
  if (bytes.length > INTAKE_LIMITS.maxBytes) throw new Stop("too-large");
  if (bytes.length === 0) throw new Stop("malformed-xml");
  const text = decodeFeed(bytes, charsetOf(contentType));
  if (text === "bad-encoding") throw new Stop("bad-encoding");

  const parser = new SaxesParser({ xmlns: true, position: false });
  let format: "rss" | "atom" | undefined;
  const stack: SaxesTagNS[] = [];
  const raws: Raw[] = [];
  let count = 0;
  let cur: Raw | undefined;
  // The field being captured: its name, the depth it opened at and its mode.
  let field: { name: keyof Raw; depth: number; mode: Mode; buf: string } | undefined;

  parser.on("doctype", () => {
    throw new Stop("dtd-forbidden");
  });
  parser.on("error", () => {
    throw new Stop("malformed-xml");
  });
  parser.on("opentag", (tag) => {
    stack.push(tag);
    const depth = stack.length;
    if (depth > INTAKE_LIMITS.maxDepth) throw new Stop("too-deep");
    if (depth === 1) {
      const version = tag.attributes["version"];
      const v = typeof version === "string" ? version : version?.value;
      if (tag.local === "rss" && tag.uri === "" && ["2.0", "0.91", "0.92"].includes(v ?? "")) format = "rss";
      else if (tag.local === "feed" && tag.uri === ATOM_NS) format = "atom";
      else throw new Stop("unsupported-format");
      return;
    }
    // Child elements inside a captured field contribute only their text.
    if (field) return;
    const parent = stack[depth - 2];
    const isItem =
      format === "rss"
        ? tag.local === "item" && tag.uri === "" && depth === 3 && parent?.local === "channel"
        : tag.local === "entry" && tag.uri === ATOM_NS && depth === 2;
    if (isItem) {
      count += 1;
      if (count > INTAKE_LIMITS.maxItems) throw new Stop("too-many-items");
      cur = {};
      return;
    }
    if (!cur) return;
    const itemDepth = format === "rss" ? 3 : 2;
    if (depth !== itemDepth + 1) return;
    if (format === "rss" && tag.uri === "") {
      const map: Record<string, keyof Raw> = {
        title: "title",
        link: "link",
        pubDate: "date",
        description: "description",
      };
      const name = map[tag.local];
      if (name) field = { name, depth, mode: name === "title" || name === "description" ? "html" : "text", buf: "" };
    } else if (format === "atom" && tag.uri === ATOM_NS) {
      if (tag.local === "link") {
        const rel = tag.attributes["rel"];
        const relV = typeof rel === "string" ? rel : rel?.value;
        const href = tag.attributes["href"];
        const hrefV = typeof href === "string" ? href : href?.value;
        if (cur.link === undefined && (relV === undefined || relV === "alternate") && hrefV !== undefined)
          cur.link = hrefV;
        return;
      }
      const map: Record<string, keyof Raw> = {
        title: "title",
        published: "date",
        updated: "updated",
        summary: "description",
        content: "content",
      };
      const name = map[tag.local];
      if (name) field = { name, depth, mode: atomMode(tag), buf: "" };
    }
  });
  const onText = (t: string) => {
    if (field) field.buf += t;
  };
  parser.on("text", onText);
  parser.on("cdata", onText);
  parser.on("closetag", () => {
    const depth = stack.length;
    stack.pop();
    if (field && depth === field.depth) {
      if (cur) {
        const { name, mode, buf } = field;
        if (name === "title" || name === "description" || name === "content") {
          if (cur[name] === undefined) cur[name] = { text: buf, mode };
        } else if (cur[name] === undefined) cur[name] = buf;
      }
      field = undefined;
      return;
    }
    const itemDepth = format === "rss" ? 3 : 2;
    if (cur && depth === itemDepth) {
      raws.push(cur);
      cur = undefined;
    }
  });

  parser.write(text).close();
  if (!format) throw new Stop("malformed-xml");
  return { ok: true, ...toItems(raws, format, source, fetchedAt) };
}

const plain = (f: { text: string; mode: Mode } | undefined, max: number): string =>
  f === undefined ? "" : cleanText(f.mode === "html" ? htmlToText(f.text) : f.text, max);

function toItems(raws: Raw[], format: "rss" | "atom", source: ParseSource, fetchedAt: string) {
  const items: ParsedItem[] = [];
  const dropped: Partial<Record<DropReason, number>> = {};
  const drop = (r: DropReason) => {
    dropped[r] = (dropped[r] ?? 0) + 1;
  };
  const seenUrls = new Set<string>();
  const seenKeys = new Set<string>();
  for (const raw of raws) {
    const title = plain(raw.title, INTAKE_LIMITS.titleMax);
    if (!title) {
      drop("missing-title");
      continue;
    }
    const link = (raw.link ?? "").trim();
    if (!link) {
      drop("missing-link");
      continue;
    }
    if (link.length > MAX_ITEM_URL_LENGTH || !itemUrlOk(link)) {
      drop("bad-link");
      continue;
    }
    const dateText = format === "rss" ? raw.date : (raw.date ?? raw.updated);
    const publishedAt =
      dateText === undefined ? null : format === "rss" ? parseRssDate(dateText) : parseAtomDate(dateText);
    if (!publishedAt) {
      drop("bad-date");
      continue;
    }
    const norm = normaliseUrl(link);
    const key = `${source.id}\u0000${title}\u0000${publishedAt}`;
    if (seenUrls.has(norm) || seenKeys.has(key)) {
      drop("duplicate");
      continue;
    }
    seenUrls.add(norm);
    seenKeys.add(key);
    const id = itemId(source.id, norm);
    if (!ITEM_ID.test(id)) continue;
    // Keys in schema order (F5-24); no excerpt key at all unless the rights allow one (F5-25).
    const excerpt = EXCERPT_RIGHTS.has(source.rights)
      ? plain(raw.description ?? raw.content, INTAKE_LIMITS.excerptMax)
      : "";
    items.push({
      id,
      sourceId: source.id,
      title,
      url: link,
      publishedAt,
      fetchedAt,
      ...(excerpt ? { excerpt } : {}),
      status: "queued",
    });
  }
  return { items, dropped };
}
