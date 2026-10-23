// A tiny deterministic zip writer for the F5-51 artifact fixtures. Every field the import
// checks can be set by hand (mode, method, declared size, CRC, local name, flags), so each
// negative fixture is one readable line in tests/fixtures/f5/artifact/fixtures.ts.
import { crc32, deflateRawSync } from "node:zlib";

export interface ZipEntrySpec {
  name: string;
  data?: Buffer | string;
  /** Unix mode including the file type; default 0o100644 (0o040755 for a name ending in /). */
  mode?: number;
  method?: 0 | 8;
  /** Override the declared uncompressed size (central and local). */
  size?: number;
  crc?: number;
  /** Override the local header's name (a central/local mismatch). */
  localName?: string;
  flags?: number;
  /** Raw deflate payload to store instead of compressing `data` (zip bombs). */
  rawDeflate?: Buffer;
}

const DOS_TIME = 0; // 00:00:00
const DOS_DATE = ((2026 - 1980) << 9) | (10 << 5) | 9; // 2026-10-09

export function buildZip(specs: ZipEntrySpec[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const s of specs) {
    const data = typeof s.data === "string" ? Buffer.from(s.data, "utf8") : (s.data ?? Buffer.alloc(0));
    const isDir = s.name.endsWith("/");
    const method = s.method ?? (isDir ? 0 : 8);
    const body = s.rawDeflate ?? (method === 8 ? deflateRawSync(data) : data);
    const crc = s.crc ?? crc32(data);
    const size = s.size ?? data.length;
    const name = Buffer.from(s.name, "latin1");
    const localName = Buffer.from(s.localName ?? s.name, "latin1");
    const flags = s.flags ?? 0;
    const mode = s.mode ?? (isDir ? 0o040755 : 0o100644);

    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0);
    l.writeUInt16LE(20, 4);
    l.writeUInt16LE(flags, 6);
    l.writeUInt16LE(method, 8);
    l.writeUInt16LE(DOS_TIME, 10);
    l.writeUInt16LE(DOS_DATE, 12);
    l.writeUInt32LE(crc >>> 0, 14);
    l.writeUInt32LE(body.length, 18);
    l.writeUInt32LE(size, 22);
    l.writeUInt16LE(localName.length, 26);
    l.writeUInt16LE(0, 28);
    locals.push(l, localName, body);

    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE((3 << 8) | 20, 4); // made by Unix
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(flags, 8);
    c.writeUInt16LE(method, 10);
    c.writeUInt16LE(DOS_TIME, 12);
    c.writeUInt16LE(DOS_DATE, 14);
    c.writeUInt32LE(crc >>> 0, 16);
    c.writeUInt32LE(body.length, 20);
    c.writeUInt32LE(size, 24);
    c.writeUInt16LE(name.length, 28);
    const external = (((mode & 0xffff) << 16) | (isDir ? 0x10 : 0)) >>> 0;
    c.writeUInt32LE(external, 38);
    c.writeUInt32LE(offset, 42);
    centrals.push(c, name);
    offset += 30 + localName.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0);
  e.writeUInt16LE(specs.length, 8);
  e.writeUInt16LE(specs.length, 10);
  e.writeUInt32LE(cd.length, 12);
  e.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, e]);
}
