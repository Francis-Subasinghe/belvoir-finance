/**
 * F4-01, F4-13, F4-27, F4-30 to F4-33: the tool-source scans over the real
 * tree, and every negative fixture in tests/fixtures/f4/source/ failing the
 * same exported function (AGENTS.md rule 7).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { walkFiles } from "../helpers/design-scan";
import {
  bannedApiProblems,
  componentProblems,
  type F4Problem,
  type F4Rule,
  moneyPathProblems,
  pureModuleProblems,
  scriptProblems,
  sinkProblems,
  stripJsComments,
  styleWriteProblems,
} from "../helpers/f4-scan";

const DIR = "tests/fixtures/f4/source";
const read = (p: string) => readFileSync(p, "utf8");
const MODULE_DIR = "src/lib/cash-vs-profit";

/** The tool's own source: the pure modules, the browser script and the tool components. */
const TOOL_MODULES = readdirSync(MODULE_DIR)
  .filter((n) => n.endsWith(".ts"))
  .map((n) => join(MODULE_DIR, n));
const TOOL_SCRIPTS = ["src/scripts/cash-vs-profit.ts"].filter((p) => existsSync(p));
const TOOL_COMPONENTS = existsSync("src/components/tools")
  ? readdirSync("src/components/tools").map((n) => join("src/components/tools", n))
  : [];

/** Fixture → [rule, scan]. Every file in the directory must be listed. */
const NEGATIVE: Record<string, [F4Rule, (f: string, t: string) => F4Problem[]]> = {
  "uses-document.ts.fixture": ["F4-01", pureModuleProblems],
  "uses-date.ts.fixture": ["F4-01", pureModuleProblems],
  "imports-outside.ts.fixture": ["F4-01", pureModuleProblems],
  "second-money-path.ts.fixture": ["F4-13", moneyPathProblems],
  "is-inline.astro.fixture": ["F4-30", componentProblems],
  "define-vars.astro.fixture": ["F4-30", componentProblems],
  "client-load.astro.fixture": ["F4-31", componentProblems],
  "set-html.astro.fixture": ["F4-32", componentProblems],
  "eval.ts.fixture": ["F4-32", sinkProblems],
  "new-function.ts.fixture": ["F4-32", sinkProblems],
  "settimeout-string.ts.fixture": ["F4-32", sinkProblems],
  "inner-html.ts.fixture": ["F4-32", sinkProblems],
  "insert-adjacent-html.ts.fixture": ["F4-32", sinkProblems],
  "outer-html.ts.fixture": ["F4-32", sinkProblems],
  "document-write.ts.fixture": ["F4-32", sinkProblems],
  "element-style.ts.fixture": ["F4-33", styleWriteProblems],
  "set-attribute-style.ts.fixture": ["F4-33", styleWriteProblems],
  "fetch-same-origin.ts.fixture": ["F4-27", bannedApiProblems],
  "xhr.ts.fixture": ["F4-27", bannedApiProblems],
  "send-beacon.ts.fixture": ["F4-27", bannedApiProblems],
  "websocket.ts.fixture": ["F4-27", bannedApiProblems],
  "event-source.ts.fixture": ["F4-27", bannedApiProblems],
  "local-storage.ts.fixture": ["F4-27", bannedApiProblems],
  "session-storage.ts.fixture": ["F4-27", bannedApiProblems],
  "document-cookie.ts.fixture": ["F4-27", bannedApiProblems],
  "cookie-store.ts.fixture": ["F4-27", bannedApiProblems],
  "indexeddb.ts.fixture": ["F4-27", bannedApiProblems],
  "caches.ts.fixture": ["F4-27", bannedApiProblems],
  "service-worker.ts.fixture": ["F4-27", bannedApiProblems],
  "replace-state.ts.fixture": ["F4-27", bannedApiProblems],
  "push-state.ts.fixture": ["F4-27", bannedApiProblems],
  "location-search.ts.fixture": ["F4-27", bannedApiProblems],
  "location-hash.ts.fixture": ["F4-27", bannedApiProblems],
  "dynamic-import.ts.fixture": ["F4-27", bannedApiProblems],
  "post-message.ts.fixture": ["F4-27", bannedApiProblems],
};

describe("F4 source scans: negative fixtures fail the real scans", () => {
  it("every fixture in tests/fixtures/f4/source is listed", () => {
    expect(readdirSync(DIR).sort()).toEqual(Object.keys(NEGATIVE).sort());
  });
  it.each(Object.entries(NEGATIVE).map(([name, [rule, scan]]) => [`${rule} ${name}`, name, rule, scan] as const))(
    "%s fails its scan",
    (_n, name, rule, scan) => {
      const problems = scan(join(DIR, name), read(join(DIR, name)));
      expect(problems.map((p) => p.rule)).toContain(rule);
    },
  );
  it("F4-27 / F4-32 / F4-33 every script fixture also fails the combined scriptProblems scan", () => {
    for (const [name, [rule]] of Object.entries(NEGATIVE)) {
      if (!["F4-27", "F4-32", "F4-33", "F4-13"].includes(rule) || name.endsWith(".astro.fixture")) continue;
      expect(scriptProblems(name, read(join(DIR, name))).length, name).toBeGreaterThan(0);
    }
  });
  it("comments are ignored in sources but an emitted .js is scanned as it is", () => {
    const text = "// never use Date or fetch( here\n/* localStorage */ export const x = 1;";
    expect(pureModuleProblems("a.ts", text)).toEqual([]);
    expect(bannedApiProblems("a.ts", text)).toEqual([]);
    expect(bannedApiProblems("a.js", text).length).toBeGreaterThan(0);
    expect(stripJsComments('const u = "http://x"; // c')).toBe('const u = "http://x"; ');
  });
  it("JsonLd.astro is the one is:inline / set:html exception", () => {
    const tag = '<script type="application/ld+json" is:inline set:html={json} />';
    expect(componentProblems("src/components/JsonLd.astro", tag)).toEqual([]);
    expect(componentProblems("src/components/tools/JsonLd2.astro", tag).map((p) => p.rule)).toEqual(["F4-30", "F4-32"]);
  });
});

describe("F4 source scans: the real tree", () => {
  it("F4-01 the tool modules are pure and import only from their own folder", () => {
    expect(TOOL_MODULES.length).toBeGreaterThanOrEqual(5);
    expect(TOOL_MODULES.flatMap((f) => pureModuleProblems(f, read(f)))).toEqual([]);
  });
  it("F4-13 formatGBP is the only money path in the tool source", () => {
    expect([...TOOL_MODULES, ...TOOL_SCRIPTS].flatMap((f) => moneyPathProblems(f, read(f)))).toEqual([]);
  });
  it("F4-27 / F4-32 / F4-33 the tool source has no banned API, sink or style write", () => {
    expect([...TOOL_MODULES, ...TOOL_SCRIPTS, ...TOOL_COMPONENTS].flatMap((f) => scriptProblems(f, read(f)))).toEqual(
      [],
    );
  });
  it("F4-30 / F4-31 / F4-32 no is:inline (outside JsonLd.astro), define:vars, client:* or set:html in src/", () => {
    const astro = walkFiles("src", [".astro"]);
    expect(astro.length).toBeGreaterThan(20);
    expect(astro.flatMap((f) => componentProblems(f, read(f)))).toEqual([]);
  });
});
