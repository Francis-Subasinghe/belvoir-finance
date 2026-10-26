// F5-40 / F5-51 artifact fixtures. Each zip in this folder is buildZip(spec) for one entry
// below (tests/unit/intake-import.test.ts checks the committed bytes match), so every
// negative case is readable here rather than only as binary.
import { deflateRawSync } from "node:zlib";
import type { ZipEntrySpec } from "../../../helpers/zip.ts";

/** The committed Source the test repo starts with (a copy of the F1 placeholder). */
export const SOURCE_ID = "example-official-statistics";
export const SOURCE_PATH = `content/sources/${SOURCE_ID}.yaml`;
export const SOURCE_YAML = `name: Example Official Statistics (placeholder)
publisher: Example Publisher (placeholder)
category: primary-official
topics:
  - understand-the-numbers
jurisdiction: UK
website: https://www.example.org/
feedType: none
updateFrequency: Unknown (placeholder)
rights: unknown
rightsNotes: Placeholder entry for F1 schema testing. Real registry entries arrive in F5.
role: primary
owner: placeholder-reviewer
lastChecked: 2026-10-02
editorialNotes: Not a real source.
demo: true
status: paused
`;
/** The same Source after one failed run: only the F5-33 fields added. */
/** Written as Forge's intake writes it (scripts/intake.ts on tests/fixtures/f5): quoted UTC datetime. */
export const SOURCE_FAILED = `${SOURCE_YAML}lastError: http-500\nlastErrorAt: "2026-10-23T00:00:00Z"\nconsecutiveFailures: 1\n`;

/** Q-11: `<sourceId>-<first 12 hex of sha256(normalised url)>`, as Forge's parser derives it. */
export const ITEM_ID = `${SOURCE_ID}-a1ac90ea1a7b`;
export const ITEM_URL = "https://www.example.org/placeholder-item";
export const ITEM_HOST = "www.example.org";
export const ITEM_PATH = `content/source-items/${ITEM_ID}.json`;
export const ITEM_JSON = `${JSON.stringify(
  {
    sourceId: SOURCE_ID,
    title: "Placeholder source item (demo)",
    url: ITEM_URL,
    publishedAt: "2026-10-01T09:00:00Z",
    fetchedAt: "2026-10-23T00:00:00Z",
    status: "queued",
  },
  null,
  2,
)}\n`;
/** A summary in Forge's grammar (SUMMARY_LINE_PATTERNS) with one `[items]` line per item id. */
export function summaryFor(ids: readonly string[]): string {
  return [
    `run sources=1 ok=0 failed=1 new-items=${ids.length} duplicates=0 invalid-sources=0`,
    "[failures]",
    `${SOURCE_ID} http-500 x1`,
    "[dropped]",
    "[items]",
    ...ids.map((id) => `${id} ${ITEM_HOST}`),
    "",
  ].join("\n");
}
export const SUMMARY = summaryFor([ITEM_ID]);
const ITEM_RE = /^content\/source-items\/([a-z0-9-]{1,64})\.json$/;

const dirs: ZipEntrySpec[] = [{ name: "content/" }, { name: "content/source-items/" }, { name: "content/sources/" }];
const ok: ZipEntrySpec[] = [
  ...dirs,
  { name: ITEM_PATH, data: ITEM_JSON },
  { name: SOURCE_PATH, data: SOURCE_FAILED },
  { name: "summary.txt", data: SUMMARY },
];
const withItem = (
  name: string,
  data: Buffer | string = ITEM_JSON,
  extra: Partial<ZipEntrySpec> = {},
): ZipEntrySpec[] => [
  { name: ITEM_PATH, data: ITEM_JSON },
  { name, data, ...extra },
  // Every well-formed item gets its F5-50 summary line, so each fixture fails on its own rule only.
  { name: "summary.txt", data: summaryFor([ITEM_ID, ...(ITEM_RE.exec(name)?.slice(1) ?? [])]) },
];

export interface ArtifactFixture {
  /** The rule this fixture breaks (AC id) and the code the import must fail with. */
  ac: string;
  code: string;
  why: string;
  specs: ZipEntrySpec[];
}

/** ok.zip is the positive control; every other entry must be rejected with `code`, writing nothing. */
export const ARTIFACT_FIXTURES: Record<string, ArtifactFixture> = {
  "ok.zip": {
    ac: "F5-51",
    code: "",
    why: "a valid queue: one new item, one Source with only F5-33 fields changed",
    specs: ok,
  },
  "traversal.zip": { ac: "F5-40", code: "entry-name", why: "an entry named ../x.json", specs: withItem("../x.json") },
  "traversal-nested.zip": {
    ac: "F5-40",
    code: "entry-name",
    why: "content/source-items/../../x.json",
    specs: withItem("content/source-items/../../x.json"),
  },
  "absolute.zip": {
    ac: "F5-40",
    code: "entry-name",
    why: "an absolute path",
    specs: withItem("/content/source-items/abc.json"),
  },
  "backslash.zip": {
    ac: "F5-40",
    code: "entry-name",
    why: "Windows separators",
    specs: withItem("content\\source-items\\abc.json"),
  },
  "other-path.zip": {
    ac: "F5-40",
    code: "entry-name",
    why: "content/stories/x.mdoc",
    specs: withItem("content/stories/x.mdoc"),
  },
  "other-dir.zip": {
    ac: "F5-40",
    code: "entry-name",
    why: "a directory other than the two content folders",
    specs: withItem("content/stories/"),
  },
  "hidden.zip": {
    ac: "F5-40",
    code: "entry-name",
    why: "a dotfile next to the queue",
    specs: withItem(".github/workflows/x.yml", "on: push\n"),
  },
  "odd-id.zip": {
    ac: "F5-40",
    code: "entry-name",
    why: "an upper-case, underscored item id",
    specs: withItem("content/source-items/A_b.json"),
  },
  "long-id.zip": {
    ac: "F5-40",
    code: "entry-name",
    why: "a 65-character item id",
    specs: withItem(`content/source-items/${"a".repeat(65)}.json`),
  },
  "non-ascii.zip": {
    ac: "F5-40",
    code: "entry-name",
    why: "a non-ASCII look-alike name",
    specs: withItem("content/source-items/\u00e4bc.json"),
  },
  "source-odd-name.zip": {
    ac: "F5-40",
    code: "entry-name",
    why: "a Source slug with a double hyphen",
    specs: withItem("content/sources/a--b.yaml", SOURCE_YAML),
  },
  "symlink.zip": {
    ac: "F5-40",
    code: "entry-symlink",
    why: "an item that is a symlink to /etc/passwd",
    specs: withItem("content/source-items/abcd.json", "/etc/passwd", { mode: 0o120777 }),
  },
  "fifo.zip": {
    ac: "F5-40",
    code: "entry-special",
    why: "a FIFO",
    specs: withItem("content/source-items/abcd.json", "", { mode: 0o010644 }),
  },
  "device.zip": {
    ac: "F5-40",
    code: "entry-special",
    why: "a character device",
    specs: withItem("content/source-items/abcd.json", "", { mode: 0o020644 }),
  },
  "duplicate.zip": {
    ac: "F5-51",
    code: "entry-duplicate",
    why: "the same entry twice (second copy different)",
    specs: withItem(ITEM_PATH, "{}"),
  },
  "item-too-large.zip": {
    ac: "F5-51",
    code: "entry-too-large",
    why: "an item JSON of 16 KiB + 1",
    specs: withItem("content/source-items/big.json", " ".repeat(16 * 1024 + 1)),
  },
  "source-too-large.zip": {
    ac: "F5-51",
    code: "entry-too-large",
    why: "a Source YAML of 16 KiB + 1",
    specs: withItem(SOURCE_PATH, `${SOURCE_YAML}#${"x".repeat(16 * 1024)}\n`),
  },
  "summary-too-large.zip": {
    ac: "F5-51",
    code: "entry-too-large",
    why: "summary.txt of 256 KiB + 1",
    specs: [
      { name: ITEM_PATH, data: ITEM_JSON },
      { name: "summary.txt", data: "x".repeat(256 * 1024 + 1) },
    ],
  },
  "bomb.zip": {
    ac: "F5-51",
    code: "entry-too-large",
    why: "declares 100 bytes, inflates to 4 MiB (a zip bomb)",
    specs: withItem("content/source-items/bomb.json", "", {
      size: 100,
      rawDeflate: deflateRawSync(Buffer.alloc(4 * 1024 * 1024, 0x20)),
    }),
  },
  "size-lie.zip": {
    ac: "F5-51",
    code: "entry-corrupt",
    why: "declares fewer bytes than it inflates to (under the cap)",
    specs: withItem("content/source-items/abcd.json", ITEM_JSON, { size: 10 }),
  },
  "crc.zip": {
    ac: "F5-51",
    code: "entry-corrupt",
    why: "a wrong CRC",
    specs: withItem("content/source-items/abcd.json", ITEM_JSON, { crc: 0xdeadbeef }),
  },
  "local-name.zip": {
    ac: "F5-51",
    code: "zip-inconsistent",
    why: "central name is allowed, the local header (what unzip extracts) says ../x.json",
    specs: withItem("content/source-items/abcd.json", ITEM_JSON, { localName: "../../x.json" }),
  },
  "encrypted.zip": {
    ac: "F5-51",
    code: "zip-unsupported",
    why: "an encrypted entry",
    specs: withItem("content/source-items/abcd.json", ITEM_JSON, { flags: 1 }),
  },
  "item-not-json.zip": {
    ac: "F5-51",
    code: "item-json",
    why: "an item that is not JSON",
    specs: withItem("content/source-items/abcd.json", "{ not json"),
  },
  "item-array.zip": {
    ac: "F5-51",
    code: "item-json",
    why: "an item that is a JSON array",
    specs: withItem("content/source-items/abcd.json", "[]\n"),
  },
  "item-invalid.zip": {
    ac: "F5-51",
    code: "item-schema",
    why: "an item JSON that fails sourceItemSchema (javascript: url, published status)",
    specs: withItem(
      "content/source-items/abcd.json",
      `${JSON.stringify({ sourceId: SOURCE_ID, title: "x", url: "javascript:alert(1)", publishedAt: "2026-10-01T09:00:00Z", fetchedAt: "2026-10-23T00:00:00Z", status: "published" }, null, 2)}\n`,
    ),
  },
  "item-unknown-source.zip": {
    ac: "F5-51",
    code: "item-source",
    why: "an item naming a Source that is not committed",
    specs: withItem("content/source-items/abcd.json", ITEM_JSON.replace(SOURCE_ID, "no-such-source")),
  },
  "not-utf8.zip": {
    ac: "F5-51",
    code: "entry-encoding",
    why: "an item in Latin-1",
    specs: withItem("content/source-items/abcd.json", Buffer.from('{"title":"caf\xe9"}', "latin1")),
  },
  "source-changed.zip": {
    ac: "F5-33",
    code: "source-changed",
    why: "a Source YAML that changes status as well as lastError",
    specs: withItem(SOURCE_PATH, SOURCE_FAILED.replace("status: paused", "status: active")),
  },
  "source-new.zip": {
    ac: "F5-51",
    code: "source-unknown",
    why: "a Source the repo does not have",
    specs: withItem("content/sources/new-source.yaml", SOURCE_YAML),
  },
  "source-alias.zip": {
    ac: "F5-51",
    code: "source-yaml",
    why: "a Source YAML with an alias",
    specs: withItem(SOURCE_PATH, `${SOURCE_YAML}x: &a 1\ny: *a\n`),
  },
  "source-dup-key.zip": {
    ac: "F5-51",
    code: "source-yaml",
    why: "a Source YAML with a duplicate key",
    specs: withItem(SOURCE_PATH, `${SOURCE_YAML}status: active\n`),
  },
  "source-invalid.zip": {
    ac: "F5-51",
    code: "source-schema",
    why: "a Source YAML that fails sourceSchema",
    specs: withItem(SOURCE_PATH, "name: 42\n"),
  },
  "summary-url.zip": {
    ac: "F5-35",
    code: "summary-format",
    why: "summary.txt carrying a URL with a query",
    specs: [
      { name: ITEM_PATH, data: ITEM_JSON },
      { name: "summary.txt", data: `${SUMMARY}https://evil.example/?token=abc\n` },
    ],
  },
  "summary-fence.zip": {
    ac: "F5-35",
    code: "summary-format",
    why: "summary.txt closing the Markdown fence in the job summary",
    specs: [
      { name: ITEM_PATH, data: ITEM_JSON },
      { name: "summary.txt", data: `${SUMMARY}\`\`\`\n# injected\n` },
    ],
  },
  "no-summary.zip": {
    ac: "F5-34",
    code: "summary-missing",
    why: "no summary.txt",
    specs: [{ name: ITEM_PATH, data: ITEM_JSON }],
  },
};
