/** F5-01, F5-11, F5-12, F5-18, F5-41, F5-52: source scans and committed-content guards. */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkContentRules } from "../../../src/lib/content-rules.ts";
import { NetworkBlocked } from "../../helpers/no-network.ts";
import { reachers } from "../../fixtures/f5/scan/network.test.fixture.ts";
import { importGraph, impurities, TAG_STRIP_REGEX, walkTs } from "../../helpers/f5.ts";

const INTAKE = resolve("src/lib/intake");
const PAGE_ENTRIES = [
  ...walkTs("src/pages"),
  ...walkTs("src/components"),
  ...walkTs("src/layouts"),
  "src/content.config.ts",
  "astro.config.mjs",
];

describe("F5-12 the parser is pure", () => {
  it("F5-12 no fetch, node:http(s), node:dns, node:net, node:fs, process.env, Date.now, new Date() or Math.random in src/lib/intake/parse", () => {
    const files = walkTs("src/lib/intake/parse");
    expect(files.length).toBeGreaterThanOrEqual(4);
    expect(files.flatMap((f) => impurities(readFileSync(f, "utf8")).map((i) => `${f}: ${i}`))).toEqual([]);
  });
  it("F5-12 negative: the scan fixture trips every rule", () => {
    expect(impurities(readFileSync("tests/fixtures/f5/scan/impure-parser.ts", "utf8")).sort()).toEqual(
      [
        "fetch",
        "node:http(s)",
        "node:dns",
        "node:net",
        "node:fs",
        "process.env",
        "Date.now",
        "new Date()",
        "Math.random",
      ].sort(),
    );
  });
});

describe("F5-12 / F5-41 / F5-11 nothing the site builds reaches intake or the queue", () => {
  it("F5-41 no page, component, layout, content config or Astro config reaches src/lib/intake (import graph)", () => {
    const reached = [...importGraph(PAGE_ENTRIES)].filter((f) => f.startsWith(INTAKE));
    expect(reached).toEqual([]);
    expect(importGraph(PAGE_ENTRIES).size).toBeGreaterThan(20);
  });
  it("F5-41 negative: a module importing the intake folder is caught", () => {
    const reached = [...importGraph(["tests/fixtures/f5/scan/page-imports-intake.ts"])].filter((f) =>
      f.startsWith(INTAKE),
    );
    expect(reached.length).toBeGreaterThan(0);
  });
  it("F5-11 no page or component reads the sourceItems collection", () => {
    for (const f of [
      ...walkTs("src/pages"),
      ...walkTs("src/components"),
      ...walkTs("src/layouts"),
      ...walkTs("src/lib"),
    ]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/get(?:Collection|Entry|Entries)\(\s*["']sourceItems["']/);
    }
  });
});

describe("F5-18 no tag-stripping regex in the intake folder", () => {
  it("F5-18 the intake folder has none", () => {
    for (const f of walkTs("src/lib/intake")) expect(readFileSync(f, "utf8"), f).not.toMatch(TAG_STRIP_REGEX);
  });
  it("F5-18 negative: the scan fixture and the common forms are caught", () => {
    expect(readFileSync("tests/fixtures/f5/scan/regex-strip.ts.fixture", "utf8")).toMatch(TAG_STRIP_REGEX);
    for (const re of ["/<[^>]+>/g", "/<\\/?[a-z][^>]*>/gi", "/<[^>]*?>/"]) expect(re, re).toMatch(TAG_STRIP_REGEX);
  });
});

describe("F5-41 no network in tests", () => {
  it.each(Object.keys(reachers))("F5-41 negative: %s from a test throws NetworkBlocked", async (k) => {
    const fn = reachers[k] as () => unknown;
    await expect(async () => await fn()).rejects.toBeInstanceOf(NetworkBlocked);
  });
});

describe("F5-01 the seed (deferred, Q-1, Q-2)", () => {
  const report = checkContentRules("content");
  const seeds = report.entries.filter((e) => e.collection === "sources" && e.raw.demo === false);
  it("F5-01 between 8 and 12 non-demo Sources, each valid, paused, titles-only or unknown, checked on the seed date", () => {
    expect(seeds.length).toBeGreaterThanOrEqual(8);
    expect(seeds.length).toBeLessThanOrEqual(12);
    expect(report.errors).toEqual([]);
    for (const s of seeds) {
      expect(s.data, s.file).toBeDefined();
      expect(s.raw.status, s.file).toBe("paused");
      expect(["titles-only", "unknown"], s.file).toContain(s.raw.rights);
      expect(String(s.raw.name), s.file).not.toMatch(/placeholder/i);
      expect(String(s.raw.publisher), s.file).not.toMatch(/placeholder/i);
      expect(s.raw.lastChecked, s.file).toMatch(/^2026-\d\d-\d\d$/);
      expect(String(s.raw.rightsNotes), s.file).toMatch(/awaiting Francis \(pre-launch list\)/);
    }
  });
  it("F5-01 no seed carries intake fields, and none is fetched while paused", () => {
    for (const s of seeds)
      for (const k of ["lastError", "lastErrorAt", "consecutiveFailures"]) expect(s.raw[k], s.file).toBeUndefined();
  });
});

describe("F5-52 ADR-0001 req 6 amended", () => {
  const adr = readFileSync("docs/decisions/ADR-0001-platform.md", "utf8");
  it("F5-52 the intake job is read-only and only uploads an artifact; no intake write token", () => {
    expect(adr).toMatch(/intake job is read-only \(`contents: read`, no secrets\) and only uploads an artifact/);
    expect(adr).not.toMatch(/pull-requests: write/);
  });
});

it("F5-12 the parse folder lists the expected modules", () => {
  expect(readdirSync("src/lib/intake/parse").sort()).toEqual([
    "dates.ts",
    "encoding.ts",
    "limits.ts",
    "parse.ts",
    "text.ts",
  ]);
});
