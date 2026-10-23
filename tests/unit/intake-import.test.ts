/**
 * F5-40 / F5-51 (also F5-33, F5-34, F5-35): the artifact import and the pre-upload verify.
 * Every committed fixture in tests/fixtures/f5/artifact/ runs through the same runImport the
 * CLI uses, against a throwaway repo, and every negative one must fail with its code and
 * write nothing.
 *
 * Everything runs against Forge's real schemas, caps and summary grammar from
 * src/lib/sources/schema.ts (statically imported by the scripts): there is no test double.
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ARTIFACT_DIRS,
  ARTIFACT_LIMITS,
  ARTIFACT_PATH_PATTERNS,
  SOURCE_INTAKE_FIELDS,
  summaryProblems,
} from "../../src/lib/sources/schema.ts";
import { ArtifactError, ENTRY_KINDS, kindOf, readArtifact } from "../../scripts/intake-artifact.ts";
import {
  ImportError,
  applyPlan,
  crossCheckWithUnzip,
  readQueueDir,
  runImport,
  withoutMutableFields,
} from "../../scripts/intake-queue.ts";
import {
  ARTIFACT_FIXTURES,
  ITEM_HOST,
  ITEM_ID,
  ITEM_JSON,
  ITEM_PATH,
  SOURCE_FAILED,
  SOURCE_PATH,
  SOURCE_YAML,
  SUMMARY,
  summaryFor,
} from "../fixtures/f5/artifact/fixtures.ts";
import { buildZip, type ZipEntrySpec } from "../helpers/zip.ts";

const FX = "tests/fixtures/f5/artifact";

let work: string;
let repo: string;
let oldTmp: string | undefined;

/** A throwaway repo with the committed Source and empty queue folders. */
function makeRepo(): string {
  const r = join(work, "repo");
  mkdirSync(join(r, "content/source-items"), { recursive: true });
  mkdirSync(join(r, "content/sources"), { recursive: true });
  writeFileSync(join(r, SOURCE_PATH), SOURCE_YAML);
  return r;
}

/** Every file under a folder with its bytes, for "nothing was written" checks. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (rel: string) => {
    for (const n of readdirSync(join(dir, rel))) {
      const r = rel ? `${rel}/${n}` : n;
      const st = lstatSync(join(dir, r));
      if (st.isDirectory()) walk(r);
      else out[r] = st.isSymbolicLink() ? "<symlink>" : readFileSync(join(dir, r), "utf8");
    }
  };
  walk("");
  return out;
}

const codeOf = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    if (e instanceof ArtifactError) return e.code;
    if (e instanceof ImportError)
      return e.code === "queue-invalid" ? e.problems.map((p) => p.split(":")[0]).join(",") : e.code;
    throw e;
  }
  return "";
};

const importZip = (zip: string, dryRun = false) => runImport({ repo, zip, dryRun, log: () => {} });
const writeZip = (name: string, specs: ZipEntrySpec[]) => {
  const p = join(work, name);
  writeFileSync(p, buildZip(specs));
  return p;
};

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "intake-test-"));
  repo = makeRepo();
  oldTmp = process.env["TMPDIR"];
  mkdirSync(join(work, "tmp"));
  process.env["TMPDIR"] = join(work, "tmp");
});
afterEach(() => {
  if (oldTmp === undefined) delete process.env["TMPDIR"];
  else process.env["TMPDIR"] = oldTmp;
  rmSync(work, { recursive: true, force: true });
});

describe("F5-40 / F5-51 pinned limits and patterns", () => {
  it("F5-51 ARTIFACT_LIMITS are 16 KiB JSON, 16 KiB YAML, 256 KiB summary, 2,000 entries, 8 MiB total", () => {
    expect(ARTIFACT_LIMITS).toEqual({
      itemJsonBytes: 16384,
      sourceYamlBytes: 16384,
      summaryBytes: 262144,
      maxEntries: 2000,
      totalBytes: 8388608,
    });
  });

  it("F5-40 the three entry patterns are exactly the AC's, and kindOf maps them in order", () => {
    expect(ARTIFACT_PATH_PATTERNS.map((re) => re.source)).toEqual([
      "^content\\/source-items\\/[a-z0-9-]{1,64}\\.json$",
      "^content\\/sources\\/[a-z0-9]+(?:-[a-z0-9]+)*\\.yaml$",
      "^summary\\.txt$",
    ]);
    for (const re of ARTIFACT_PATH_PATTERNS) expect(re.flags).toBe("");
    expect(ARTIFACT_DIRS).toEqual(["content", "content/source-items", "content/sources"]);
    expect(ENTRY_KINDS).toEqual(["item", "source", "summary"]);
    expect([ITEM_PATH, SOURCE_PATH, "summary.txt", "content/x.json"].map(kindOf)).toEqual([
      "item",
      "source",
      "summary",
      undefined,
    ]);
  });

  it("F5-33 only lastError, lastErrorAt and consecutiveFailures may differ", () => {
    expect(SOURCE_INTAKE_FIELDS).toEqual(["lastError", "lastErrorAt", "consecutiveFailures"]);
    expect(withoutMutableFields(SOURCE_FAILED)).toBe(SOURCE_YAML);
    expect(withoutMutableFields(SOURCE_FAILED.replace("status: paused", "status: active"))).not.toBe(SOURCE_YAML);
  });
});

describe("F5-40 / F5-51 committed artifact fixtures", () => {
  it("every committed zip is exactly its spec in fixtures.ts, and every spec is committed", () => {
    const zips = readdirSync(FX)
      .filter((f) => f.endsWith(".zip"))
      .sort();
    expect(zips).toEqual(Object.keys(ARTIFACT_FIXTURES).sort());
    for (const [file, f] of Object.entries(ARTIFACT_FIXTURES))
      expect(readFileSync(join(FX, file)).equals(buildZip(f.specs)), file).toBe(true);
  });

  it("F5-51 ok.zip imports: one item created, the Source updated, summary returned, temp folder removed", () => {
    const plan = importZip(join(FX, "ok.zip"));
    expect(plan.writes.map((w) => [w.name, w.action])).toEqual([
      [ITEM_PATH, "create"],
      [SOURCE_PATH, "update"],
    ]);
    expect(plan.summary).toBe(SUMMARY);
    expect(readFileSync(join(repo, ITEM_PATH), "utf8")).toBe(ITEM_JSON);
    expect(readFileSync(join(repo, SOURCE_PATH), "utf8")).toBe(SOURCE_FAILED);
    expect(Object.keys(snapshot(repo)).sort()).toEqual([ITEM_PATH, SOURCE_PATH]);
    expect(readdirSync(join(work, "tmp"))).toEqual([]);
  });

  it("F5-51 importing the same artifact twice is a no-op; --dry-run writes nothing", () => {
    const before = snapshot(repo);
    importZip(join(FX, "ok.zip"), true);
    expect(snapshot(repo)).toEqual(before);
    importZip(join(FX, "ok.zip"));
    const after = snapshot(repo);
    expect(importZip(join(FX, "ok.zip")).writes.map((w) => w.action)).toEqual(["unchanged", "unchanged"]);
    expect(snapshot(repo)).toEqual(after);
  });

  const negatives = Object.entries(ARTIFACT_FIXTURES).filter(([, f]) => f.code !== "");
  it.each(negatives)("%s fails and writes nothing", (file, f) => {
    const before = snapshot(repo);
    expect(new Set(codeOf(() => importZip(join(FX, file))).split(",")), `${f.ac} ${f.why}`).toEqual(new Set([f.code]));
    expect(snapshot(repo)).toEqual(before);
    expect(readdirSync(join(work, "tmp"))).toEqual([]);
  });
});

describe("F5-51 caps on the whole artifact", () => {
  const item = (i: number, data: string = ITEM_JSON): ZipEntrySpec => ({
    name: `content/source-items/i${i}.json`,
    data,
  });

  it("F5-51 2,000 files pass the count cap; 2,001 fail with too-many-entries", () => {
    const ids = Array.from({ length: 1999 }, (_, i) => `i${i}`);
    const n2000 = [{ name: "summary.txt", data: summaryFor(ids) }, ...ids.map((_, i) => item(i))];
    expect(codeOf(() => importZip(writeZip("2000.zip", n2000), true))).toBe("");
    expect(codeOf(() => importZip(writeZip("2001.zip", [...n2000, item(5000)])))).toBe("too-many-entries");
  });

  it("F5-51 more than 8 MiB in total fails with total-too-large, before inflating anything", () => {
    const big = `${" ".repeat(16 * 1024 - 2)}{}`;
    const specs = Array.from({ length: 513 }, (_, i) => item(i, big)); // 513 x 16 KiB > 8 MiB
    expect(codeOf(() => importZip(writeZip("total.zip", specs)))).toBe("total-too-large");
    expect(codeOf(() => readArtifact(buildZip(specs.slice(0, 512))))).toBe("");
  });

  it("F5-51 exactly 16 KiB item and 256 KiB summary are allowed (the caps are inclusive)", () => {
    const at = `${" ".repeat(16 * 1024 - 2)}{}`;
    expect(
      codeOf(() => readArtifact(buildZip([item(1, at), { name: "summary.txt", data: "x".repeat(256 * 1024) }]))),
    ).toBe("");
  });

  it("F5-51 a zip over ZIP_MAX_BYTES is refused before it is parsed", () => {
    const p = join(work, "huge.zip");
    writeFileSync(p, Buffer.alloc(10 * 1024 * 1024 + 1));
    expect(codeOf(() => importZip(p))).toBe("too-large");
  });

  it("F5-51 the zip path itself may not be a symlink", () => {
    const p = join(work, "link.zip");
    symlinkSync(join(process.cwd(), FX, "ok.zip"), p);
    expect(() => importZip(p)).toThrow(/ELOOP|not a regular file/);
  });
});

describe("F5-51 writes into the working tree", () => {
  it("F5-24 an item that already exists with other bytes fails item-exists (create-only)", () => {
    writeFileSync(join(repo, ITEM_PATH), "{}\n");
    expect(codeOf(() => importZip(join(FX, "ok.zip")))).toBe("item-exists");
    expect(readFileSync(join(repo, ITEM_PATH), "utf8")).toBe("{}\n");
    expect(readFileSync(join(repo, SOURCE_PATH), "utf8")).toBe(SOURCE_YAML);
  });

  it("F5-51 a symlink at an item's target path is refused, and its target untouched", () => {
    const outside = join(work, "outside.json");
    writeFileSync(outside, "keep\n");
    symlinkSync(outside, join(repo, ITEM_PATH));
    expect(codeOf(() => importZip(join(FX, "ok.zip")))).toBe("target-unsafe");
    expect(readFileSync(outside, "utf8")).toBe("keep\n");
  });

  it("F5-51 a symlink at a Source's target path is refused, and its target untouched", () => {
    const outside = join(work, "outside.yaml");
    writeFileSync(outside, SOURCE_YAML);
    rmSync(join(repo, SOURCE_PATH));
    symlinkSync(outside, join(repo, SOURCE_PATH));
    expect(codeOf(() => importZip(join(FX, "ok.zip")))).toBe("item-source,target-unsafe");
    expect(readFileSync(outside, "utf8")).toBe(SOURCE_YAML);
  });

  it("F5-51 content/source-items as a symlink out of the repo is refused before any write", () => {
    const elsewhere = join(work, "elsewhere");
    mkdirSync(elsewhere);
    rmSync(join(repo, "content/source-items"), { recursive: true });
    symlinkSync(elsewhere, join(repo, "content/source-items"));
    expect(codeOf(() => importZip(join(FX, "ok.zip")))).toBe("target-unsafe");
    expect(readdirSync(elsewhere)).toEqual([]);
    expect(readFileSync(join(repo, SOURCE_PATH), "utf8")).toBe(SOURCE_YAML);
  });

  it("F5-51 the import leaves no temp file next to the Source it rewrote", () => {
    importZip(join(FX, "ok.zip"));
    expect(readdirSync(join(repo, "content/sources"))).toEqual(["example-official-statistics.yaml"]);
  });
});

describe("F5-40 intake:verify on an output folder (the workflow step before upload)", () => {
  function queue(): string {
    const q = join(work, "queue");
    mkdirSync(join(q, "content/source-items"), { recursive: true });
    mkdirSync(join(q, "content/sources"), { recursive: true });
    writeFileSync(join(q, ITEM_PATH), ITEM_JSON);
    writeFileSync(join(q, SOURCE_PATH), SOURCE_FAILED);
    writeFileSync(join(q, "summary.txt"), SUMMARY);
    return q;
  }
  const verify = (q: string) => runImport({ repo, fromDir: q, dryRun: true, log: () => {} });

  it("F5-40 a valid output folder passes and nothing is written", () => {
    const before = snapshot(repo);
    expect(verify(queue()).writes).toHaveLength(2);
    expect(snapshot(repo)).toEqual(before);
  });

  it.each([
    [
      "a symlink",
      "entry-symlink",
      (q: string) => symlinkSync("/etc/passwd", join(q, "content/source-items/abcd.json")),
    ],
    [
      "a FIFO",
      "entry-special",
      (q: string) => expect(spawnSync("mkfifo", [join(q, "content/source-items/abcd.json")]).status).toBe(0),
    ],
    ["another folder", "entry-name", (q: string) => mkdirSync(join(q, "content/stories"))],
    ["a file outside the patterns", "entry-name", (q: string) => writeFileSync(join(q, "content/x.json"), "{}")],
    [
      "a symlinked content folder",
      "entry-symlink",
      (q: string) => symlinkSync(join(q, "content/sources"), join(q, "content/source-items/x")),
    ],
    [
      "an over-cap item",
      "entry-too-large",
      (q: string) => writeFileSync(join(q, "content/source-items/big.json"), " ".repeat(16 * 1024 + 1)),
    ],
    [
      "an invalid item",
      "item-schema",
      (q: string) => writeFileSync(join(q, "content/source-items/bad.json"), '{"status":"published"}'),
    ],
  ])("F5-40 an output folder with %s fails with %s", (_what, code, mutate) => {
    const q = queue();
    mutate(q);
    expect(codeOf(() => verify(q))).toContain(code);
  });

  it("F5-40 readQueueDir never follows the folder's own symlinks", () => {
    const q = queue();
    rmSync(join(q, "summary.txt"));
    symlinkSync(join(q, ITEM_PATH), join(q, "summary.txt"));
    expect(() => readQueueDir(q)).toThrow(/entry-symlink/);
  });
});

describe("F5-35 / F5-50 summary.txt uses Forge's grammar (summaryProblems)", () => {
  it.each([
    ["a URL", "see https://example.org/x"],
    ["a query string", "feed?token=abc"],
    ["a Markdown fence", "```"],
    ["a path", "content/stories/x"],
    ["HTML", "<b>x</b>"],
    ["a quoted title", '"Budget 2026"'],
    ["a 201-character line", "a".repeat(201)],
    ["a non-ASCII character", "caf\u00e9"],
  ])("F5-35 a summary line with %s is rejected", (_what, line) => {
    expect(summaryProblems(`${SUMMARY}${line}\n`)).not.toEqual([]);
  });

  it("F5-35 the fixture summary passes, with its item line", () => {
    expect(summaryProblems(SUMMARY, [{ id: ITEM_ID, url: `https://${ITEM_HOST}/placeholder-item` }])).toEqual([]);
  });

  it("F5-50 an artifact whose summary misses an item, or shows a shortened host, fails summary-format", () => {
    const short = SUMMARY.replace(`${ITEM_ID} ${ITEM_HOST}`, `${ITEM_ID} example.org`);
    const none = SUMMARY.replace(`${ITEM_ID} ${ITEM_HOST}\n`, "");
    for (const s of [short, none]) {
      const zip = writeZip("s.zip", [
        { name: ITEM_PATH, data: ITEM_JSON },
        { name: "summary.txt", data: s },
      ]);
      expect(codeOf(() => importZip(zip))).toBe("summary-format");
    }
  });
});

describe("F5-51 the CLI (npm run intake:import / intake:verify)", () => {
  const cli = (...args: string[]) =>
    spawnSync(process.execPath, ["scripts/intake-import.ts", ...args], { encoding: "utf8" });

  it("F5-51 usage errors exit 2", () => {
    expect(cli().status).toBe(2);
    expect(cli("--artifact", "../1").status).toBe(2);
    expect(cli("a.zip", "b.zip").status).toBe(2);
  });
});

describe("F5-51 against Forge's real schemas (src/lib/sources/schema.ts)", () => {
  const realImport = async (zip: string) => runImport({ repo, zip, dryRun: true, log: () => {} });

  it("F5-51 ok.zip passes the real sourceItemSchema and sourceSchema", async () => {
    await expect(realImport(join(FX, "ok.zip"))).resolves.toBeTruthy();
  });

  it("F5-51 item-invalid.zip fails the real sourceItemSchema with item-schema", async () => {
    await expect(realImport(join(FX, "item-invalid.zip"))).rejects.toMatchObject({
      code: "queue-invalid",
      problems: expect.arrayContaining([expect.stringMatching(/^item-schema:/)]),
    });
  });

  it("F5-51 source-invalid.zip fails the real sourceSchema with source-schema", async () => {
    await expect(realImport(join(FX, "source-invalid.zip"))).rejects.toMatchObject({
      code: "queue-invalid",
      problems: expect.arrayContaining([expect.stringMatching(/^source-schema:/)]),
    });
  });
});

describe("F5-24 / F5-51 write and second-parser guards", () => {
  it("F5-24 a create that finds the file already there (a race after planning) fails and leaves it untouched", () => {
    writeFileSync(join(repo, ITEM_PATH), "raced");
    expect(() =>
      applyPlan({ writes: [{ name: ITEM_PATH, action: "create", data: Buffer.from("{}") }], summary: "" }, repo),
    ).toThrow(/EEXIST/);
    expect(readFileSync(join(repo, ITEM_PATH), "utf8")).toBe("raced");
  });

  it("F5-51 a zip that unzip -tq rejects fails with zip-inconsistent", () => {
    const p = join(work, "not-a-zip.zip");
    writeFileSync(p, "PK\u0005\u0006 this is not a zip");
    expect(codeOf(() => crossCheckWithUnzip(p, []))).toBe("zip-inconsistent");
  });
});

describe("F5-40 / F5-51 end to end: npm run intake on the fixtures, then intake:verify, then import", () => {
  const node = (...args: string[]) => spawnSync(process.execPath, args, { encoding: "utf8" });
  const REGISTRY = "tests/fixtures/f5/registry";

  /** Every file under the intake output, as zip specs (what upload-artifact would hold). */
  function zipSpecs(dir: string): ZipEntrySpec[] {
    const out: ZipEntrySpec[] = [];
    const walk = (rel: string) => {
      for (const n of readdirSync(join(dir, rel)).sort()) {
        const r = rel ? `${rel}/${n}` : n;
        if (lstatSync(join(dir, r)).isDirectory()) walk(r);
        else out.push({ name: r, data: readFileSync(join(dir, r)) });
      }
    };
    walk("");
    return out;
  }

  it("F5-40 the workflow's two commands pass on the committed fixtures, and the queue imports", () => {
    const out = join(work, "intake");
    const run = node("scripts/intake.ts", "--fixtures", "tests/fixtures/f5", "--out", out);
    expect(run.status, run.stderr).toBe(0);
    expect(existsSync(join(out, "summary.txt"))).toBe(true);

    // The intake.yml verify step, word for word.
    const ok = node("scripts/intake-import.ts", "--verify", out, "--registry", REGISTRY);
    expect(ok.status, ok.stderr).toBe(0);
    expect(ok.stdout).toMatch(/intake queue OK: \d+ file\(s\) checked/);
    // Against content/sources the fixture Sources are unknown, so the registry flag is load-bearing.
    expect(node("scripts/intake-import.ts", "--verify", out).status).toBe(1);

    // The same queue as an artifact zip imports into a repo whose registry is the fixtures'.
    for (const f of readdirSync(REGISTRY))
      writeFileSync(join(repo, "content/sources", f), readFileSync(join(REGISTRY, f)));
    const zip = writeZip("artifact.zip", zipSpecs(out));
    const plan = runImport({ repo, zip, log: () => {} });
    const items = plan.writes.filter((w) => w.name.startsWith("content/source-items/"));
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((w) => w.action === "create")).toBe(true);
    for (const w of plan.writes) expect(readFileSync(join(repo, w.name))).toEqual(readFileSync(join(out, w.name)));
  });

  it("F5-40 --registry must be a folder inside the repo, and only with --verify", () => {
    expect(node("scripts/intake-import.ts", "--verify", work, "--registry", tmpdir()).status).toBe(2);
    expect(node("scripts/intake-import.ts", "--verify", work, "--registry", "no/such/dir").status).toBe(2);
    expect(node("scripts/intake-import.ts", "--registry", REGISTRY, join(FX, "ok.zip")).status).toBe(2);
    expect(() => runImport({ repo, zip: join(FX, "ok.zip"), sourcesDir: REGISTRY, log: () => {} })).toThrow(
      /only for verify/,
    );
  });
});
