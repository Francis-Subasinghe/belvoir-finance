/** F5-21, F5-24, F5-28 (override), F5-31 to F5-35, F5-40, F5-45, F5-50, F5-53: one intake run. */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { format } from "prettier";
import { afterAll, describe, expect, it } from "vitest";
import { parseDocument } from "yaml";
import { type FetchDeps, fetchFeed } from "../../../src/lib/intake/fetch.ts";
import { fixtureNet } from "../../../src/lib/intake/fixture-net.ts";
import { itemId, parseFeed } from "../../../src/lib/intake/parse/parse.ts";
import {
  allowedFeedUrls,
  artifactTreeProblems,
  isFetchable,
  runIntake,
  tlsOverridden,
  YAML_OUT,
} from "../../../src/lib/intake/run.ts";
import { serialiseItem, writeItem } from "../../../src/lib/intake/write.ts";
import {
  ARTIFACT_LIMITS,
  isArtifactPath,
  normaliseUrl,
  sourceChangeProblems,
  summaryProblems,
  validateSourceItemText,
  validateSourceText,
} from "../../../src/lib/sources/schema.ts";
import { FIXTURE_FETCHED_AT, main } from "../../../scripts/intake.ts";
import { FETCHED_AT, feed, okItems, parse } from "../../helpers/f5.ts";

const F5 = "tests/fixtures/f5";
const tmp = mkdtempSync(join(tmpdir(), "belvoir-f5-run-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));
let n = 0;
const fresh = (name = "d") => join(tmp, `${name}-${n++}`);

function files(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() || d.isSymbolicLink())
    .map((d) => relative(dir, join(d.parentPath, d.name)).split("\\").join("/"))
    .sort();
}
async function cli(args: string[], env: Record<string, string | undefined> = {}) {
  let out = "";
  let err = "";
  const code = await main(args, env, { out: (s) => (out += s), err: (s) => (err += s) });
  return { code, out, err };
}
/** The fixture run, with the transport's requests recorded. */
async function fixtureRun(outDir = fresh("out"), extra: Partial<Parameters<typeof runIntake>[0]> = {}) {
  const net = fixtureNet(join(F5, "net", "script.json"));
  const registry = readdirSync(join(F5, "registry")).map((f) => ({
    id: f.slice(0, -5),
    text: readFileSync(join(F5, "registry", f), "utf8"),
  }));
  const r = await runIntake({ ...net, registry, existing: [], outDir, fetchedAt: FETCHED_AT, env: {}, ...extra });
  return { ...r, outDir, requests: net.requests, registry };
}

describe("F5-24 one serialiser, safe paths", () => {
  it("F5-24 the id is <sourceId>-<12 hex of sha256(normalised url)> and matches ^[a-z0-9-]{1,64}$", () => {
    const items = okItems(parse("rss2-valid.xml", { id: "fx-rss" }));
    for (const i of items) {
      const want = createHash("sha256").update(normaliseUrl(i.url)).digest("hex").slice(0, 12);
      expect(i.id).toBe(`fx-rss-${want}`);
      expect(i.id).toMatch(/^[a-z0-9-]{1,64}$/);
    }
    expect(itemId("fx", "https://example.org/a")).toBe(itemId("fx", normaliseUrl("HTTPS://Example.ORG:443/a#x")));
  });
  it("F5-24 X-39 GUIDs ../../src/x and a/b write only hash-named files inside the queue", () => {
    const queue = fresh("queue");
    mkdirSync(queue);
    const items = okItems(parse("guid-traversal.xml", { id: "fx-trav" }));
    expect(items).toHaveLength(2);
    for (const i of items) expect(writeItem(queue, i)).toBe("written");
    expect(files(queue)).toEqual(items.map((i) => `${i.id}.json`).sort());
    expect(existsSync(join(queue, "..", "..", "src"))).toBe(false);
  });
  it("F5-24 an id over 64 characters or outside [a-z0-9-] is never written", () => {
    const queue = fresh("queue");
    mkdirSync(queue);
    const base = okItems(parse("rss2-valid.xml"))[0];
    if (!base) throw new Error("no item");
    for (const id of ["a".repeat(65), "Fx-Upper", "../x", "a/b", "a.b", ""])
      expect(writeItem(queue, { ...base, id }), id).toBe("bad-id");
    expect(files(queue)).toEqual([]);
  });
  it("F5-24 an existing file and a symlink at an item's target path are left untouched", () => {
    const queue = fresh("queue");
    mkdirSync(queue);
    const [a, b] = okItems(parse("rss2-valid.xml"));
    if (!a || !b) throw new Error("no items");
    writeFileSync(join(queue, `${a.id}.json`), "EXISTING\n");
    const victim = join(tmp, `victim-${n++}.txt`);
    writeFileSync(victim, "VICTIM\n");
    symlinkSync(victim, join(queue, `${b.id}.json`));
    expect(writeItem(queue, a)).toBe("exists");
    expect(writeItem(queue, b)).toBe("exists");
    expect(readFileSync(join(queue, `${a.id}.json`), "utf8")).toBe("EXISTING\n");
    expect(readFileSync(victim, "utf8")).toBe("VICTIM\n");
  });
  it("F5-24 files are JSON in schema key order with a trailing newline, pass prettier and the schema, byte-identical on rerun", async () => {
    for (const i of okItems(parse("rss2-valid.xml", { rights: "licensed", id: "fx-rss" }))) {
      const text = serialiseItem(i);
      expect(Object.keys(JSON.parse(text))).toEqual([
        "sourceId",
        "title",
        "url",
        "publishedAt",
        "fetchedAt",
        "excerpt",
        "status",
      ]);
      expect(text.endsWith("}\n")).toBe(true);
      expect(await format(text, { parser: "json", filepath: "x.json" })).toBe(text);
      expect(validateSourceItemText(text)).toMatchObject({ ok: true });
      expect(
        serialiseItem(
          okItems(parse("rss2-valid.xml", { rights: "licensed", id: "fx-rss" })).find((x) => x.id === i.id) ?? i,
        ),
      ).toBe(text);
      expect(text).not.toMatch(/^---/m);
    }
  });
});

describe("F5-31 to F5-35 the run", () => {
  it("F5-31 only active, non-demo rss/atom sources with a feedUrl and rights other than none are fetched", async () => {
    const r = await fixtureRun();
    const hosts = [...new Set(r.requests.map((u) => new URL(u).hostname))].sort();
    expect(hosts).toEqual([
      "feeds.fx-atom.test",
      "feeds.fx-failing.test",
      "feeds.fx-injection.test",
      "feeds.fx-recovering.test",
      "feeds.fx-rss.test",
    ]);
    for (const skipped of ["fx-paused", "fx-retired", "fx-demo", "fx-api", "fx-rights-none"]) {
      const f = r.registry.find((x) => x.id === skipped);
      const data = parseDocument(f?.text ?? "").toJS() as Record<string, unknown>;
      expect(isFetchable(data), skipped).toBe(false);
      expect(validateSourceText(f?.text ?? "").ok, skipped).toBe(true);
    }
  });
  it("F5-32 item links are never fetched: the transport saw only feed URLs and their redirect hops", async () => {
    const r = await fixtureRun();
    const itemUrls = ["rss2-valid.xml", "atom-valid.xml", "injection.xml"].flatMap((f) =>
      okItems(parse(f)).map((i) => i.url),
    );
    expect(itemUrls.length).toBeGreaterThan(0);
    expect(r.requests.filter((u) => itemUrls.includes(u))).toEqual([]);
    expect(r.requests.sort()).toEqual(
      [
        "https://feeds.fx-atom.test/rss",
        "https://feeds.fx-atom.test/atom.xml",
        "https://feeds.fx-failing.test/rss",
        "https://feeds.fx-injection.test/rss",
        "https://feeds.fx-recovering.test/rss",
        "https://feeds.fx-rss.test/rss",
      ].sort(),
    );
  });
  it("F5-33 a failure records lastError, lastErrorAt and an incremented consecutiveFailures; nothing else changes", async () => {
    const r = await fixtureRun();
    const before = readFileSync(join(F5, "registry", "fx-failing.yaml"), "utf8");
    const after = readFileSync(join(r.outDir, "content/sources/fx-failing.yaml"), "utf8");
    expect(sourceChangeProblems(before, after)).toEqual([]);
    const d = parseDocument(after).toJS() as Record<string, unknown>;
    expect([d.lastError, d.lastErrorAt, d.consecutiveFailures]).toEqual(["http-500", FETCHED_AT, 3]);
    // Byte-level: only the three intake lines differ.
    const strip = (t: string) => t.split("\n").filter((l) => !/^(lastError|lastErrorAt|consecutiveFailures):/.test(l));
    expect(strip(after)).toEqual(strip(before));
    expect(validateSourceText(after).ok).toBe(true);
  });
  it("F5-33 a later success removes all three fields and changes nothing else", async () => {
    const r = await fixtureRun();
    const before = readFileSync(join(F5, "registry", "fx-recovering.yaml"), "utf8");
    const after = readFileSync(join(r.outDir, "content/sources/fx-recovering.yaml"), "utf8");
    expect(after).toBe(before.replace(/^(?:lastError|lastErrorAt|consecutiveFailures):.*\n/gm, ""));
    expect(sourceChangeProblems(before, after)).toEqual([]);
  });
  it("F5-33 a Source YAML rewrite that changes another field is caught", () => {
    const before = readFileSync(join(F5, "registry", "fx-failing.yaml"), "utf8");
    expect(sourceChangeProblems(before, before.replace("status: active", "status: paused"))).toEqual(["status"]);
  });
  it("F5-33 every committed Source round-trips through the YAML document byte for byte", () => {
    for (const f of readdirSync("content/sources")) {
      const text = readFileSync(join("content/sources", f), "utf8");
      expect(parseDocument(text, { version: "1.2", schema: "core" }).toString(YAML_OUT), f).toBe(text);
    }
  });
  it("F5-33 one failing source never stops the others; F5-34 the summary lists it as <id> <code> x<n>", async () => {
    const r = await fixtureRun();
    expect(r.exitCode).toBe(0);
    expect(r.summary).toMatch(/^\[failures\]\nfx-failing http-500 x3\n\[dropped\]/m);
    expect(r.summary).toMatch(/^run sources=5 ok=4 failed=1 new-items=11 /m);
  });
  it("F5-35 X-24 through the CLI: the summary and stdout hold no title, URL, path or query", async () => {
    const out = fresh("cli");
    const r = await cli(["--fixtures", F5, "--out", out]);
    expect(r.code).toBe(0);
    expect(r.err).toBe("");
    const summary = readFileSync(join(out, "summary.txt"), "utf8");
    expect(r.out).toBe(summary);
    const items = files(join(out, "content/source-items")).map((f) =>
      JSON.parse(readFileSync(join(out, "content/source-items", f), "utf8")),
    ) as { title: string; url: string }[];
    for (const it of items) {
      expect(summary.includes(it.title), it.title).toBe(false);
      expect(summary.includes(it.url), it.url).toBe(false);
    }
    expect(summary).not.toMatch(/https?:|\?|\/|\$\{\{|---|\{%|script|Ignore/);
    expect(summaryProblems(summary)).toEqual([]);
  });
  it.each(["summary-title.txt", "summary-url.txt"])("F5-35 negative %s fails the summary grammar", (f) => {
    expect(summaryProblems(readFileSync(join(F5, "scan", f), "utf8"))).not.toEqual([]);
  });
  it("F5-23 the run writes only inert JSON strings for X-24, and changes no file outside --out", async () => {
    const out = fresh("cli");
    const repoBefore = files("content");
    await cli(["--fixtures", F5, "--out", out]);
    expect(files("content")).toEqual(repoBefore);
    const inj = files(join(out, "content/source-items"))
      .filter((f) => f.startsWith("fx-injection-"))
      .map((f) => readFileSync(join(out, "content/source-items", f), "utf8"));
    expect(inj).toHaveLength(5);
    for (const text of inj) {
      const v = JSON.parse(text);
      expect(v.status).toBe("queued");
      expect(JSON.stringify(v, null, 2) + "\n").toBe(text);
    }
  });
});

describe("F5-50 the review queue shows each item's full host", () => {
  it("F5-50 every new item has one <id> <host> line with the full ASCII hostname", async () => {
    const r = await fixtureRun();
    const items = files(join(r.outDir, "content/source-items")).map((f) => ({
      id: f.slice(0, -5),
      url: JSON.parse(readFileSync(join(r.outDir, "content/source-items", f), "utf8")).url as string,
    }));
    expect(items).toHaveLength(11);
    expect(summaryProblems(r.summary, items)).toEqual([]);
    expect(r.summary).toMatch(/^fx-rss-[0-9a-f]{12} other\.example\.invalid$/m);
  });
  it("F5-50 an IDN host is shown in punycode; U-15 never reaches the queue", () => {
    const xml = `<rss version="2.0"><channel><item><title>I</title><link>https://bücher.example.invalid/a</link><pubDate>Tue, 06 Oct 2026 09:30:00 +0000</pubDate></item><item><title>U</title><link>https://hmrc.gov.uk${String.fromCharCode(64)}evil.example.invalid/</link><pubDate>Tue, 06 Oct 2026 09:30:00 +0000</pubDate></item></channel></rss>`;
    const r = parseFeed(Buffer.from(xml), { source: { id: "fx", rights: "unknown" }, fetchedAt: FETCHED_AT });
    const items = okItems(r);
    expect(items).toHaveLength(1);
    expect(new URL(items[0]?.url ?? "").hostname).toBe("xn--bcher-kva.example.invalid");
  });
  it("F5-50 negative: a missing or shortened host fails", () => {
    const text = readFileSync(join(F5, "scan", "summary-short-host.txt"), "utf8");
    expect(
      summaryProblems(text, [
        { id: "fx-rss-aaaaaaaaaaaa", url: "https://news.example.invalid/a" },
        { id: "fx-rss-bbbbbbbbbbbb", url: "https://news.example.invalid/b" },
      ]),
    ).toEqual([
      "fx-rss-aaaaaaaaaaaa: host example.invalid is not the full host news.example.invalid",
      "fx-rss-bbbbbbbbbbbb: no item line",
    ]);
  });
});

describe("F5-21 dedupe against the existing queue", () => {
  it("F5-21 an item already in content/source-items (by normalised url or fallback key) is not written again", async () => {
    const existing = [
      {
        sourceId: "fx-rss",
        title: "x",
        url: "HTTPS://NEWS.example.invalid:443/one#frag",
        publishedAt: "2020-01-01T00:00:00Z",
      },
      {
        sourceId: "fx-rss",
        title: "Second fixture item",
        url: "https://elsewhere.example.invalid/",
        publishedAt: "2026-10-05T12:00:00Z",
      },
    ];
    const r = await fixtureRun(fresh("out"), { existing });
    expect(r.summary).toMatch(/^fx-rss duplicate 2$/m);
    expect(files(join(r.outDir, "content/source-items")).filter((f) => f.startsWith("fx-rss-"))).toHaveLength(1);
  });
});

describe("F5-26 the allowed set is every feedUrl selected for the run", () => {
  const registry = () =>
    readdirSync(join(F5, "registry")).map(
      (f) => parseDocument(readFileSync(join(F5, "registry", f), "utf8")).toJS() as Record<string, unknown>,
    );
  it("F5-26 the set holds exactly the active, rights-allowing, non-demo feedUrls", () => {
    expect([...allowedFeedUrls(registry())].sort()).toEqual([
      "https://feeds.fx-atom.test/rss",
      "https://feeds.fx-failing.test/rss",
      "https://feeds.fx-injection.test/rss",
      "https://feeds.fx-recovering.test/rss",
      "https://feeds.fx-rss.test/rss",
    ]);
  });
  it.each([
    "https://feeds.fx-paused.test/rss",
    "https://feeds.fx-retired.test/rss",
    "https://feeds.fx-rights-none.test/rss",
    "https://feeds.fx-rss.test/other",
  ])("F5-26 %s, outside the set, is not-in-registry with 0 lookups and 0 requests", async (url) => {
    const net = fixtureNet(join(F5, "net", "script.json"));
    let lookups = 0;
    let requests = 0;
    const r = await fetchFeed(url, allowedFeedUrls(registry()), {
      resolver: (h, sig) => (lookups++, net.resolver(h, sig)),
      transport: (req) => (requests++, net.transport(req)),
    });
    expect(r).toEqual({ ok: false, code: "not-in-registry" });
    expect([lookups, requests]).toEqual([0, 0]);
  });
  it("F5-26 a run fetches each selected Source with the whole set (two selected feeds both succeed)", async () => {
    const r = await fixtureRun(fresh("allowed-run"));
    expect(r.summary).toMatch(/^run sources=5 ok=4 failed=1 /);
    expect(r.summary).not.toMatch(/not-in-registry/);
  });
});

describe("F5-28 NODE_TLS_REJECT_UNAUTHORIZED stops intake before any request", () => {
  it.each(["0", "1", ""])(
    "F5-28 with NODE_TLS_REJECT_UNAUTHORIZED=%j: run tls-override, non-zero, 0 requests",
    async (v) => {
      const outDir = fresh("tls");
      const transport: FetchDeps["transport"] = () => {
        throw new Error("no request may be made");
      };
      const r = await fixtureRun(outDir, { env: { NODE_TLS_REJECT_UNAUTHORIZED: v }, transport });
      expect(r.exitCode).not.toBe(0);
      expect(readFileSync(join(outDir, "summary.txt"), "utf8")).toBe("run tls-override\n");
      expect(files(outDir)).toEqual(["summary.txt"]);
      const c = await cli(["--fixtures", F5, "--out", fresh("tls-cli")], { NODE_TLS_REJECT_UNAUTHORIZED: v });
      expect([c.code, c.out]).toEqual([1, "run tls-override\n"]);
    },
  );
});

describe("F5-28 a swapped trust store also stops intake before any request", () => {
  it.each([
    { NODE_EXTRA_CA_CERTS: "/tmp/extra.pem" },
    { NODE_EXTRA_CA_CERTS: "" },
    { NODE_OPTIONS: "--use-openssl-ca" },
    { NODE_OPTIONS: "--max-old-space-size=512 --use-system-ca" },
  ])("F5-28 with %j: run tls-override, non-zero, 0 requests", async (env) => {
    const outDir = fresh("tls-ca");
    const transport: FetchDeps["transport"] = () => {
      throw new Error("no request may be made");
    };
    const r = await fixtureRun(outDir, { env, transport });
    expect(r.exitCode).toBe(1);
    expect(readFileSync(join(outDir, "summary.txt"), "utf8")).toBe("run tls-override\n");
    expect(files(outDir)).toEqual(["summary.txt"]);
    const c = await cli(["--fixtures", F5, "--out", fresh("tls-ca-cli")], env);
    expect([c.code, c.out]).toEqual([1, "run tls-override\n"]);
  });
  it("F5-28 unrelated NODE_OPTIONS don't trip the guard", () => {
    expect(tlsOverridden({ NODE_OPTIONS: "--max-old-space-size=512 --use-bundled-ca" })).toBe(false);
    expect(tlsOverridden({})).toBe(false);
  });
});

describe("F5-40 output is the review queue only", () => {
  it("F5-40 the allowlist patterns", () => {
    for (const ok of ["content/source-items/fx-a-0123456789ab.json", "content/sources/fx-a.yaml", "summary.txt"])
      expect(isArtifactPath(ok), ok).toBe(true);
    for (const bad of [
      "content/stories/x.mdoc",
      "../x.json",
      "content/source-items/../x.json",
      "content/source-items/X.json",
      `content/source-items/${"a".repeat(65)}.json`,
      "content/sources/a--b.yaml",
      "content/sources/a.yml",
      "summary.md",
      "/summary.txt",
    ])
      expect(isArtifactPath(bad), bad).toBe(false);
    expect(ARTIFACT_LIMITS).toEqual({
      itemJsonBytes: 16384,
      sourceYamlBytes: 16384,
      summaryBytes: 262144,
      maxEntries: 2000,
      totalBytes: 8388608,
    });
  });
  it("F5-40 a run touching a path outside the queue, a symlink or a FIFO fails the path check", () => {
    const dir = fresh("tree");
    mkdirSync(join(dir, "content/source-items"), { recursive: true });
    mkdirSync(join(dir, "content/stories"), { recursive: true });
    writeFileSync(join(dir, "summary.txt"), "run tls-override\n");
    writeFileSync(join(dir, "content/stories/x.mdoc"), "x");
    symlinkSync("/etc/hostname", join(dir, "content/source-items/fx-a-0123456789ab.json"));
    spawnSync("mkfifo", [join(dir, "content/source-items/fx-b-0123456789ab.json")]);
    expect(artifactTreeProblems(dir).sort()).toEqual(
      [
        "content/source-items/fx-a-0123456789ab.json",
        "content/source-items/fx-b-0123456789ab.json",
        "content/stories",
      ].sort(),
    );
  });
  it("F5-40 the fixture run's output passes the path check and every file validates", async () => {
    const r = await fixtureRun();
    expect(artifactTreeProblems(r.outDir)).toEqual([]);
    for (const f of files(r.outDir)) {
      expect(isArtifactPath(f), f).toBe(true);
      const text = readFileSync(join(r.outDir, f), "utf8");
      if (f.endsWith(".json")) expect(validateSourceItemText(text).ok, f).toBe(true);
      if (f.endsWith(".yaml")) expect(validateSourceText(text).ok, f).toBe(true);
    }
  });
});

describe("F5-45 determinism", () => {
  it("F5-45 the CLI gives byte-identical output under TZ=UTC and TZ=Pacific/Kiritimati", () => {
    const hashes = ["UTC", "Pacific/Kiritimati"].map((tz) => {
      const out = fresh(`tz-${tz.replace("/", "-")}`);
      const r = spawnSync(process.execPath, ["scripts/intake.ts", "--fixtures", F5, "--out", out], {
        env: { PATH: process.env.PATH ?? "", TZ: tz },
        encoding: "utf8",
      });
      expect(r.status, r.stderr).toBe(0);
      return files(out).map(
        (f) =>
          `${f} ${createHash("sha256")
            .update(readFileSync(join(out, f)))
            .digest("hex")}`,
      );
    });
    expect(hashes[0]?.length).toBeGreaterThan(10);
    expect(hashes[1]).toEqual(hashes[0]);
  });
  it("F5-45 the fixture fetchedAt is fixed", () => {
    expect(FIXTURE_FETCHED_AT).toBe("2026-10-23T00:00:00Z");
    expect(feed("rss2-valid.xml").length).toBeGreaterThan(0);
  });
});

describe("F5-53 no live fetch without an explicit selection", () => {
  it("F5-53 the CLI refuses to run without --fixtures, and refuses --fixtures with --live", async () => {
    expect((await cli(["--out", fresh("x")])).code).toBe(2);
    expect((await cli(["--fixtures", F5, "--live", "--out", fresh("x")])).code).toBe(2);
    expect((await cli(["--live", "--out", fresh("x")])).err).toMatch(/--live needs --fetched-at/);
    expect((await cli(["--fixtures", F5])).code).toBe(2);
  });
  it("F5-53 the live transport is loaded only behind --live (a dynamic import), never by fixture runs", () => {
    const src = readFileSync("scripts/intake.ts", "utf8");
    expect(src).not.toMatch(/^import .*live\.ts/m);
    expect(src).toMatch(
      /if \(fixtures !== undefined\)[\s\S]*else \{[\s\S]*await import\("..\/src\/lib\/intake\/live\.ts"\)/,
    );
  });
  it("F5-40 --out must be new or empty", async () => {
    const out = fresh("busy");
    mkdirSync(out);
    writeFileSync(join(out, "keep.txt"), "x");
    expect((await cli(["--fixtures", F5, "--out", out])).code).toBe(2);
  });
});
