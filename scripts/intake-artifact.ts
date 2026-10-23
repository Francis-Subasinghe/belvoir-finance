// F5-40 / F5-51: read an intake artifact (a zip) as data and check every entry before
// anything is written. Pure functions over bytes, so the unit tests run them on built
// zips; scripts/intake-import.ts adds the download, `unzip -tq`, zipinfo and the copy.
//
// The zip is parsed here, not extracted by a tool: entries are only ever inflated into
// memory, streamed in INFLATE_CHUNK pieces and aborted as soon as the output passes the
// entry's cap (or what is left of the total), so a zip bomb never holds more than
// cap + one chunk, and a path trick or a symlink never reaches the disk.
import { createInflateRaw, crc32 } from "node:zlib";
// F5-40 / F5-51: the patterns, directories and caps are Forge's, never copied here.
import { ARTIFACT_DIRS, ARTIFACT_LIMITS, ARTIFACT_PATH_PATTERNS, isArtifactPath } from "../src/lib/sources/schema.ts";

/** The three F5-40 entry kinds, in the order of Forge's ARTIFACT_PATH_PATTERNS. */
export const ENTRY_KINDS = ["item", "source", "summary"] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

/** Output chunk size of the streaming inflate: the most it can read past a cap. */
export const INFLATE_CHUNK = 16 * 1024;

/** Test hook: counts the inflated bytes actually read from the stream. Never set by the CLI. */
export interface InflateMeter {
  bytes: number;
}

/**
 * Inflate raw deflate data, reading at most `limit` bytes plus one INFLATE_CHUNK: the
 * stream is destroyed on the first chunk that passes `limit`. Returns `over: true` then.
 */
export function inflateBounded(
  body: Buffer,
  limit: number,
  meter?: InflateMeter,
): Promise<{ data: Buffer; over: boolean }> {
  return new Promise((resolve, reject) => {
    const z = createInflateRaw({ chunkSize: INFLATE_CHUNK });
    const chunks: Buffer[] = [];
    let n = 0;
    let done = false;
    const finish = (over: boolean) => {
      if (done) return;
      done = true;
      if (over) z.destroy();
      resolve({ data: over ? Buffer.alloc(0) : Buffer.concat(chunks, n), over });
    };
    z.on("data", (c: Buffer) => {
      if (done) return;
      n += c.length;
      if (meter) meter.bytes += c.length;
      if (n > limit) finish(true);
      else chunks.push(c);
    });
    z.on("end", () => finish(false));
    z.on("error", (e) => {
      if (!done) {
        done = true;
        reject(e);
      }
    });
    z.end(body);
  });
}

/** A fixed list of failure codes, so a test can pin which rule fired. */
export type ArtifactCode =
  | "zip-unreadable"
  | "zip-unsupported"
  | "zip-inconsistent"
  | "entry-name"
  | "entry-duplicate"
  | "entry-symlink"
  | "entry-special"
  | "entry-too-large"
  | "too-many-entries"
  | "total-too-large"
  | "entry-corrupt"
  | "entry-encoding"
  | "summary-format";

export class ArtifactError extends Error {
  readonly code: ArtifactCode;
  constructor(code: ArtifactCode, detail: string) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

export interface ArtifactEntry {
  name: string;
  kind: EntryKind;
  data: Buffer;
}

export function kindOf(name: string): EntryKind | undefined {
  if (!isArtifactPath(name)) return undefined;
  const i = ARTIFACT_PATH_PATTERNS.findIndex((re) => re.test(name));
  return ENTRY_KINDS[i];
}

/** A zip directory entry ("content/source-items/") or a walked folder ("content/source-items") is allowed. */
export function isArtifactDir(name: string): boolean {
  const bare = name.endsWith("/") ? name.slice(0, -1) : name;
  return (ARTIFACT_DIRS as readonly string[]).includes(bare);
}

export function capOf(kind: EntryKind): number {
  if (kind === "item") return ARTIFACT_LIMITS.itemJsonBytes;
  if (kind === "source") return ARTIFACT_LIMITS.sourceYamlBytes;
  return ARTIFACT_LIMITS.summaryBytes;
}

const S_IFMT = 0o170000;
const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;
const S_IFLNK = 0o120000;

/** Show a hostile name safely in an error: printable ASCII only, truncated. */
const shown = (name: string) => JSON.stringify(name.slice(0, 120)).replace(/[^\x20-\x7e]/g, "?");

interface Central {
  name: string;
  method: number;
  crc: number;
  compSize: number;
  size: number;
  localOffset: number;
  isDir: boolean;
}

/** Parse the central directory and check every entry against F5-40 and the caps, before inflating anything. */
export function readCentralDirectory(zip: Buffer): Central[] {
  const fail = (code: ArtifactCode, detail: string): never => {
    throw new ArtifactError(code, detail);
  };
  if (zip.length < 22) fail("zip-unreadable", "too short for a zip");
  // End of central directory: the last signature within the final 64 KiB + 22 bytes.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) fail("zip-unreadable", "no end-of-central-directory record");
  const disk = zip.readUInt16LE(eocd + 4);
  const cdDisk = zip.readUInt16LE(eocd + 6);
  const countHere = zip.readUInt16LE(eocd + 8);
  const count = zip.readUInt16LE(eocd + 10);
  const cdSize = zip.readUInt32LE(eocd + 12);
  const cdOffset = zip.readUInt32LE(eocd + 16);
  const commentLen = zip.readUInt16LE(eocd + 20);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) fail("zip-unsupported", "zip64");
  if (disk !== 0 || cdDisk !== 0 || countHere !== count) fail("zip-unsupported", "multi-disk zip");
  if (eocd + 22 + commentLen !== zip.length) fail("zip-inconsistent", "bytes after the end record");
  if (cdOffset + cdSize !== eocd) fail("zip-inconsistent", "central directory does not end at the end record");
  if (count > ARTIFACT_LIMITS.maxEntries + ARTIFACT_DIRS.length)
    fail("too-many-entries", `${count} entries, cap ${ARTIFACT_LIMITS.maxEntries}`);

  const out: Central[] = [];
  const seen = new Set<string>();
  let files = 0;
  let total = 0;
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > eocd || zip.readUInt32LE(p) !== 0x02014b50) fail("zip-inconsistent", `central entry ${n} is missing`);
    const madeBy = zip.readUInt16LE(p + 4) >> 8;
    const flags = zip.readUInt16LE(p + 8);
    const method = zip.readUInt16LE(p + 10);
    const crc = zip.readUInt32LE(p + 16);
    const compSize = zip.readUInt32LE(p + 20);
    const size = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const cmtLen = zip.readUInt16LE(p + 32);
    const external = zip.readUInt32LE(p + 38);
    const localOffset = zip.readUInt32LE(p + 42);
    const end = p + 46 + nameLen + extraLen + cmtLen;
    if (end > eocd) fail("zip-inconsistent", `central entry ${n} overruns the directory`);
    const raw = zip.subarray(p + 46, p + 46 + nameLen);
    // Names are checked as raw bytes: printable ASCII only, so no encoding games.
    const name = raw.toString("latin1");
    p = end;

    if (flags & 0x1) fail("zip-unsupported", `${shown(name)} is encrypted`);
    if (method !== 0 && method !== 8) fail("zip-unsupported", `${shown(name)} uses compression method ${method}`);
    if (compSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff)
      fail("zip-unsupported", `${shown(name)} is zip64`);
    if (seen.has(name)) fail("entry-duplicate", `${shown(name)} appears twice`);
    seen.add(name);

    // Unix mode lives in the high half of the external attributes when made on Unix (3).
    const mode = madeBy === 3 ? external >>> 16 : 0;
    const type = mode & S_IFMT;
    const dosDir = madeBy !== 3 && (external & 0x10) !== 0;
    if (type === S_IFLNK) fail("entry-symlink", `${shown(name)} is a symlink`);
    const isDir = type === S_IFDIR || dosDir || name.endsWith("/");
    if (type !== 0 && type !== S_IFREG && type !== S_IFDIR)
      fail("entry-special", `${shown(name)} has file type 0o${type.toString(8)}`);
    if (isDir) {
      if (!isArtifactDir(name) || (type !== 0 && type !== S_IFDIR) || size !== 0)
        fail("entry-name", `directory ${shown(name)} is not allowed`);
      out.push({ name, method, crc, compSize, size, localOffset, isDir });
      continue;
    }
    const kind = kindOf(name);
    if (!/^[\x21-\x7e]+$/.test(name) || kind === undefined)
      fail("entry-name", `${shown(name)} matches no F5-40 pattern`);
    files++;
    if (files > ARTIFACT_LIMITS.maxEntries) fail("too-many-entries", `more than ${ARTIFACT_LIMITS.maxEntries} files`);
    if (size > capOf(kind as EntryKind))
      fail("entry-too-large", `${shown(name)} declares ${size} bytes, cap ${capOf(kind as EntryKind)}`);
    total += size;
    if (total > ARTIFACT_LIMITS.totalBytes)
      fail("total-too-large", `more than ${ARTIFACT_LIMITS.totalBytes} bytes in total`);
    out.push({ name, method, crc, compSize, size, localOffset, isDir });
  }
  if (p !== eocd) fail("zip-inconsistent", "central directory has trailing bytes");
  return out;
}

/**
 * Read and check the whole artifact. Throws ArtifactError on the first problem; returns the
 * files (not directories) with their inflated bytes, sorted by name.
 */
export async function readArtifact(zip: Buffer, meter?: InflateMeter): Promise<ArtifactEntry[]> {
  const central = readCentralDirectory(zip);
  const out: ArtifactEntry[] = [];
  const spans: [number, number][] = [];
  let total = 0;
  for (const c of central) {
    const fail = (code: ArtifactCode, detail: string): never => {
      throw new ArtifactError(code, `${shown(c.name)} ${detail}`);
    };
    const h = c.localOffset;
    if (h + 30 > zip.length || zip.readUInt32LE(h) !== 0x04034b50) fail("zip-inconsistent", "has no local header");
    const localNameLen = zip.readUInt16LE(h + 26);
    const localExtraLen = zip.readUInt16LE(h + 28);
    const localName = zip.subarray(h + 30, h + 30 + localNameLen).toString("latin1");
    // A second parser (unzip) reading local headers must see the same names and methods.
    if (localName !== c.name) fail("zip-inconsistent", `has local name ${shown(localName)}`);
    if (zip.readUInt16LE(h + 8) !== c.method) fail("zip-inconsistent", "local and central methods differ");
    if (zip.readUInt16LE(h + 6) & 0x1) fail("zip-unsupported", "is encrypted");
    const start = h + 30 + localNameLen + localExtraLen;
    const end = start + c.compSize;
    if (end > zip.length) fail("zip-inconsistent", "data runs past the file");
    // No two entries may share bytes (overlapping entries are a zip-bomb technique).
    for (const [s, e] of spans) if (h < e && end > s) fail("zip-inconsistent", "overlaps another entry");
    spans.push([h, end]);
    if (c.isDir) continue;

    const kind = kindOf(c.name) as EntryKind;
    const cap = capOf(kind);
    const body = zip.subarray(start, end);
    // Never read past the entry's cap or what is left of the 8 MiB total (+1 chunk at most).
    const left = ARTIFACT_LIMITS.totalBytes - total;
    const limit = Math.min(cap, left);
    let data: Buffer;
    if (c.method === 0) data = Buffer.from(body);
    else {
      let r: { data: Buffer; over: boolean };
      try {
        r = await inflateBounded(body, limit, meter);
      } catch {
        fail("entry-corrupt", "does not inflate");
        throw new Error("unreachable");
      }
      if (r.over && left < cap)
        throw new ArtifactError("total-too-large", `more than ${ARTIFACT_LIMITS.totalBytes} bytes`);
      if (r.over) fail("entry-too-large", `inflates past its cap of ${cap} bytes`);
      data = r.data;
    }
    if (data.length > cap) fail("entry-too-large", `inflates past its cap of ${cap} bytes`);
    if (data.length !== c.size) fail("entry-corrupt", `inflates to ${data.length} bytes, declared ${c.size}`);
    if (crc32(data) >>> 0 !== c.crc >>> 0) fail("entry-corrupt", "CRC mismatch");
    total += data.length;
    if (total > ARTIFACT_LIMITS.totalBytes)
      throw new ArtifactError("total-too-large", `more than ${ARTIFACT_LIMITS.totalBytes} bytes`);
    out.push({ name: c.name, kind, data });
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** Strict UTF-8 with no BOM and no NUL; feed text is data, never trusted to be well formed. */
export function decodeText(entry: { name: string; data: Buffer }): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(entry.data);
  } catch {
    throw new ArtifactError("entry-encoding", `${shown(entry.name)} is not valid UTF-8`);
  }
  if (text.startsWith("\ufeff") || text.includes("\0"))
    throw new ArtifactError("entry-encoding", `${shown(entry.name)} has a BOM or a NUL byte`);
  return text;
}
