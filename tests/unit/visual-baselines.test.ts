/**
 * F2-38 baseline hash guard (scripts/visual-baselines.ts, run by the Repo guards
 * job as `npm run check:visual-baselines`). Fixtures are written to temp folders;
 * the "PNGs" are arbitrary bytes, since the guard only hashes them.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MANIFEST,
  buildManifest,
  checkBaselines,
  manifestHeader,
  parseManifest,
  parseManifestArgs,
} from "../../scripts/visual-baselines";

const P360 = "tests/visual/__screenshots__/visual-360/gallery-linux.png";
const P768 = "tests/visual/__screenshots__/visual-768/gallery-linux.png";
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Writes files into a fresh temp repo root and returns it. */
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "belvoir-baselines-"));
  dirs.push(root);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), body);
  }
  return root;
}
const manifest = (...lines: string[]) => ["# header", "# run 123", ...lines, ""].join("\n");

describe("checkBaselines", () => {
  it("passes when every tracked baseline is listed with the right hash", () => {
    const root = fixture({
      [P360]: "a",
      [P768]: "b",
      [MANIFEST]: manifest(`${sha("a")}  ${P360}`, `${sha("b")}  ${P768}`),
    });
    expect(checkBaselines(root, [P360, P768])).toEqual([]);
  });

  it("passes with no manifest and no baselines", () => {
    expect(checkBaselines(fixture({ "README.md": "x" }), ["README.md"])).toEqual([]);
  });

  it("ignores *-linux.png files outside the screenshot folder", () => {
    const root = fixture({ [MANIFEST]: manifest() });
    expect(checkBaselines(root, ["docs/x-linux.png", "tests/visual/gallery-linux.png"])).toEqual([]);
  });

  it.each([
    ["a macOS render", "tests/visual/__screenshots__/visual-360/gallery-darwin.png"],
    ["a Windows render", "tests/visual/__screenshots__/visual-768/gallery-win32.png"],
    ["a PNG with no platform suffix", "tests/visual/__screenshots__/visual-360/gallery.png"],
    ["a text file", "tests/visual/__screenshots__/notes.txt"],
    ["a -linux file that is not a PNG", "tests/visual/__screenshots__/visual-360/gallery-linux.jpg"],
  ])("fails on %s under the screenshot folder", (_name, path) => {
    const root = fixture({ [P360]: "a", [path]: "x", [MANIFEST]: manifest(`${sha("a")}  ${P360}`) });
    expect(checkBaselines(root, [P360, path])).toEqual([
      `${path} is not a *-linux.png baseline (only CI-generated *-linux.png files belong in tests/visual/__screenshots__/)`,
    ]);
  });

  it("reports one error per stray file, sorted, alongside other problems", () => {
    const darwin = "tests/visual/__screenshots__/visual-360/gallery-darwin.png";
    const win = "tests/visual/__screenshots__/visual-1280/gallery-win32.png";
    const root = fixture({ [P360]: "tampered", [MANIFEST]: manifest(`${sha("a")}  ${P360}`) });
    const errors = checkBaselines(root, [win, P360, darwin]);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toMatch(new RegExp(`^${win} is not a \\*-linux\\.png baseline`));
    expect(errors[1]).toMatch(new RegExp(`^${darwin} is not a \\*-linux\\.png baseline`));
    expect(errors[2]).toContain(`${P360}: sha256`);
  });

  it("fails on stray files even when the manifest is missing", () => {
    const stray = "tests/visual/__screenshots__/visual-360/gallery-darwin.png";
    const root = fixture({ [stray]: "x" });
    expect(checkBaselines(root, [stray])).toEqual([
      `${stray} is not a *-linux.png baseline (only CI-generated *-linux.png files belong in tests/visual/__screenshots__/)`,
    ]);
  });

  it("(a) fails when a baseline's hash does not match", () => {
    const root = fixture({ [P360]: "tampered", [MANIFEST]: manifest(`${sha("a")}  ${P360}`) });
    const errors = checkBaselines(root, [P360]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`${P360}: sha256 ${sha("tampered")} does not match`);
  });

  it("(b) fails when a tracked baseline is not listed", () => {
    const root = fixture({ [P360]: "a", [P768]: "b", [MANIFEST]: manifest(`${sha("a")}  ${P360}`) });
    expect(checkBaselines(root, [P360, P768])).toEqual([`${P768} is not listed in ${MANIFEST}`]);
  });

  it("(b) fails when baselines exist but the manifest is missing", () => {
    const root = fixture({ [P360]: "a" });
    expect(checkBaselines(root, [P360])).toEqual([`${P360} is not listed in ${MANIFEST} (the manifest is missing)`]);
  });

  it("(c) fails when a listed baseline is not committed", () => {
    const root = fixture({ [P360]: "a", [MANIFEST]: manifest(`${sha("a")}  ${P360}`, `${sha("b")}  ${P768}`) });
    const errors = checkBaselines(root, [P360]);
    expect(errors).toEqual([`${P768} is listed in ${MANIFEST}:4 but not committed`]);
  });

  it("(c) counts only the given (tracked) files: an untracked file on disk is still missing", () => {
    const root = fixture({ [P360]: "a", [MANIFEST]: manifest(`${sha("a")}  ${P360}`) });
    expect(checkBaselines(root, [])).toEqual([`${P360} is listed in ${MANIFEST}:3 but not committed`]);
  });

  it("reports one error per problem", () => {
    const root = fixture({
      [P360]: "x",
      [P768]: "b",
      [MANIFEST]: manifest(
        `${sha("a")}  ${P360}`,
        `${sha("c")}  tests/visual/__screenshots__/visual-1280/gallery-linux.png`,
      ),
    });
    expect(checkBaselines(root, [P360, P768])).toHaveLength(3);
  });
});

describe("parseManifest", () => {
  it.each([
    ["a short hash", `abc123  ${P360}`],
    ["an upper-case hash", `${sha("a").toUpperCase()}  ${P360}`],
    ["a missing path", sha("a")],
    ["no separator", `${sha("a")}${P360}`],
    ["a single space", `${sha("a")} ${P360}`],
    ["free text", "not a manifest line"],
  ])("rejects %s as malformed", (_name, line) => {
    const { entries, errors } = parseManifest(manifest(line));
    expect(entries).toEqual([]);
    expect(errors).toEqual([`${MANIFEST}:3: malformed line (expected "<sha256>  <path>")`]);
  });

  it.each([
    ["a path outside the screenshot folder", "docs/gallery-linux.png"],
    ["a non-linux file", "tests/visual/__screenshots__/visual-360/gallery.png"],
    ["a path with ..", "tests/visual/__screenshots__/../x-linux.png"],
  ])("rejects %s", (_name, path) => {
    expect(parseManifest(manifest(`${sha("a")}  ${path}`)).errors).toHaveLength(1);
  });

  it("rejects duplicates and accepts the binary marker and CRLF", () => {
    const { entries, errors } = parseManifest(`${sha("a")} *${P360}\r\n${sha("a")}  ${P360}\r\n`);
    expect(entries).toEqual([{ hash: sha("a"), path: P360, line: 1 }]);
    expect(errors).toEqual([`${MANIFEST}:2: ${P360} is listed more than once`]);
  });

  it("a malformed line fails the whole check", () => {
    const root = fixture({ [P360]: "a", [MANIFEST]: manifest(`${sha("a")}  ${P360}`, "oops") });
    expect(checkBaselines(root, [P360])).toEqual([`${MANIFEST}:4: malformed line (expected "<sha256>  <path>")`]);
  });
});

describe("the committed baselines", () => {
  it("match tests/visual/BASELINES.sha256 (same check as CI)", () => {
    const tracked = spawnSync("git", ["ls-files", "-z", "--", "tests/visual/__screenshots__/"], { encoding: "utf8" })
      .stdout.split("\0")
      .filter(Boolean);
    expect(tracked.filter((f) => f.endsWith("-linux.png"))).toHaveLength(3);
    expect(checkBaselines(".", tracked)).toEqual([]);
  });
});

const RUN = "37241177888";
const ARTIFACT = "11317806928";
const COMMIT = "747e4d846bfd494c0762051a7124fdc2d9661e79";
const P1280 = "tests/visual/__screenshots__/visual-1280/gallery-linux.png";

describe("parseManifestArgs (npm run visual:manifest)", () => {
  it("accepts --run, --artifact and --commit, in any order and as --flag=value", () => {
    const want = { source: { run: RUN, artifact: ARTIFACT, commit: COMMIT }, errors: [] };
    expect(parseManifestArgs(["--run", RUN, "--artifact", ARTIFACT, "--commit", COMMIT])).toEqual(want);
    expect(parseManifestArgs([`--commit=${COMMIT}`, `--artifact=${ARTIFACT}`, `--run=${RUN}`])).toEqual(want);
  });

  it("requires all three", () => {
    const { source, errors } = parseManifestArgs([]);
    expect(source).toBeUndefined();
    expect(errors.slice(0, 3)).toEqual(["--run is required", "--artifact is required", "--commit is required"]);
    expect(errors[3]).toMatch(/^usage: npm run visual:manifest/);
  });

  it.each([
    ["a non-numeric run", ["--run", "abc", "--artifact", ARTIFACT, "--commit", COMMIT], /--run must be a numeric id/],
    ["a negative run", ["--run=-1", "--artifact", ARTIFACT, "--commit", COMMIT], /--run must be a numeric id/],
    [
      "a zero-padded artifact",
      ["--run", RUN, "--artifact", "011", "--commit", COMMIT],
      /--artifact must be a numeric id/,
    ],
    ["a URL as artifact", ["--run", RUN, "--artifact", "https://x/1", "--commit", COMMIT], /--artifact must be/],
    ["a short sha", ["--run", RUN, "--artifact", ARTIFACT, "--commit", "747e4d8"], /--commit must be a full 40/],
    ["an upper-case sha", ["--run", RUN, "--artifact", ARTIFACT, "--commit", COMMIT.toUpperCase()], /--commit must/],
    ["a 41-char sha", ["--run", RUN, "--artifact", ARTIFACT, "--commit", `${COMMIT}0`], /--commit must/],
    ["a missing value", ["--run", "--artifact", ARTIFACT, "--commit", COMMIT], /--run needs a value/],
    ["an unknown flag", ["--run", RUN, "--artifact", ARTIFACT, "--commit", COMMIT, "--out", "x"], /unknown argument/],
    ["a repeated flag", ["--run", RUN, "--run", RUN, "--artifact", ARTIFACT, "--commit", COMMIT], /more than once/],
  ])("rejects %s", (_name, argv, message) => {
    const { source, errors } = parseManifestArgs(argv);
    expect(source).toBeUndefined();
    expect(errors.join("\n")).toMatch(message);
  });
});

describe("buildManifest", () => {
  const source = { run: "1", artifact: "2", commit: "a".repeat(40) };

  it("writes the header, then sha256sum lines sorted by path in byte order", () => {
    const root = fixture({ [P360]: "a", [P768]: "b", [P1280]: "c" });
    const text = buildManifest(root, [P768, P360, P1280, "README.md"], source);
    expect(text).toBe(`${manifestHeader(source)}\n${sha("c")}  ${P1280}\n${sha("a")}  ${P360}\n${sha("b")}  ${P768}\n`);
    expect(manifestHeader(source)).toContain('run 1, artifact "visual-baselines" (id 2)');
    expect(manifestHeader(source)).toContain(`commit ${"a".repeat(40)} on runner ubuntu-24.04`);
  });

  it("round-trips through the guard", () => {
    const root = fixture({ [P360]: "a", [P768]: "b" });
    writeFileSync(join(root, MANIFEST), buildManifest(root, [P360, P768], source));
    expect(checkBaselines(root, [P360, P768])).toEqual([]);
  });

  it("refuses stray files, missing files and an empty set", () => {
    const stray = "tests/visual/__screenshots__/visual-360/gallery-darwin.png";
    expect(() => buildManifest(fixture({ [P360]: "a", [stray]: "x" }), [P360, stray], source)).toThrow(stray);
    expect(() => buildManifest(fixture({}), [P360], source)).toThrow(`${P360} is tracked but missing on disk`);
    expect(() => buildManifest(fixture({}), ["README.md"], source)).toThrow(/no tracked \*-linux\.png baselines/);
  });

  it("reproduces the committed tests/visual/BASELINES.sha256 byte for byte", () => {
    const tracked = spawnSync("git", ["ls-files", "-z", "--", "tests/visual/__screenshots__/"], { encoding: "utf8" })
      .stdout.split("\0")
      .filter(Boolean);
    const text = buildManifest(".", tracked, { run: RUN, artifact: ARTIFACT, commit: COMMIT });
    expect(text).toBe(readFileSync(MANIFEST, "utf8"));
  });
});
