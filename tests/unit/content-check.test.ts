import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkContentDir, checkMarkdoc, findMdx } from "../../src/lib/content-check";

const fixture = (name: string) => readFileSync(join("tests/fixtures/markdoc", name), "utf8");
const rules = (src: string) => checkMarkdoc(src).map((p) => p.rule);

describe("F1-12 Markdoc allowlist", () => {
  it("accepts allowlisted tags, code spans and https links", () => {
    expect(checkMarkdoc(fixture("valid.mdoc"))).toEqual([]);
  });

  it("rejects an unknown tag", () => {
    const problems = checkMarkdoc(fixture("unknown-tag.mdoc"));
    expect(problems.some((p) => p.rule === "markdoc-invalid" && p.message.includes("tag-undefined"))).toBe(true);
  });

  it("rejects raw HTML (inline and block)", () => {
    const problems = checkMarkdoc(fixture("raw-html.mdoc")).filter((p) => p.rule === "raw-html");
    expect(problems.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects a callout type outside the allowlist", () => {
    expect(rules(fixture("bad-callout.mdoc"))).toContain("markdoc-invalid");
  });

  it("rejects javascript:, http: and external image URLs", () => {
    expect(rules(fixture("unsafe-link.mdoc")).filter((r) => r === "unsafe-link")).toHaveLength(3);
  });
});

describe("F1-11 no .mdx under content/", () => {
  const dir = mkdtempSync(join(tmpdir(), "belvoir-content-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("detects an .mdx file at any depth", async () => {
    mkdirSync(join(dir, "stories", "nested"), { recursive: true });
    writeFileSync(join(dir, "stories", "nested", "sneaky.MDX"), "# hi\n");
    expect(findMdx(dir)).toHaveLength(1);
    const problems = await checkContentDir(dir, (f) => readFile(f, "utf8"));
    expect(problems.map((p) => p.rule)).toContain("mdx-forbidden");
  });

  it("the real content/ folder has no .mdx and passes every content check", async () => {
    expect(findMdx("content")).toEqual([]);
    expect(await checkContentDir("content", (f) => readFile(f, "utf8"))).toEqual([]);
  });
});
