/**
 * F2-38 baseline hash guard (scripts/visual-baselines.ts, run by the Repo guards
 * job as `npm run check:visual-baselines`). Fixtures are written to temp folders;
 * the "PNGs" are arbitrary bytes, since the guard only hashes them.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MANIFEST, checkBaselines, parseManifest } from "../../scripts/visual-baselines";

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

  it("ignores files that are not *-linux.png baselines", () => {
    const root = fixture({ [MANIFEST]: manifest() });
    expect(checkBaselines(root, ["tests/visual/__screenshots__/visual-360/gallery.png", "docs/x-linux.png"])).toEqual(
      [],
    );
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
