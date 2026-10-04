/**
 * F3 guards on the committed content and the source code: protected titles
 * (F3-50), placeholder URLs (F3-48), the pillar list (F3-44), the placeholder
 * pages (F3-33, F3-47), and source scans for the publication filter (F3-14),
 * the source allowlist (F3-11), time zones (F3-25) and the clock (F3-51).
 * Each scan is also run on small negative fixtures, so it can't pass vacuously.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findProtectedTerm,
  isPlaceholderUrl,
  PILLAR_LABELS,
  PILLARS,
  PROTECTED_CREDENTIAL_TERMS,
} from "../../src/content/schemas";
import { checkContentRules } from "../../src/lib/content-rules";
import { PLACEHOLDER_PAGES } from "../../src/config/site";

function walk(dir: string, exts = [".ts", ".astro", ".mjs", ".js"]): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return walk(p, exts);
    return exts.some((e) => p.endsWith(e)) ? [p] : [];
  });
}
const strip = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const SRC = [...walk("src"), ...walk("scripts"), "astro.config.mjs", "keystatic.config.ts"];

describe("F3-50 protected titles", () => {
  it.each(["ACCA", "A.C.C.A.", "Chartered Accountant", "chartered  accountant", "FCA-authorised", "a c c a", "Acca"])(
    "F3-50 %j is caught",
    (text) => expect(findProtectedTerm(text)).toBeDefined(),
  );
  it.each(["practical", "matter", "Factual reviewer", "Placeholder credential (unverified)", "Placeholder Reviewer"])(
    "F3-50 %j passes (whole-token matching)",
    (text) => expect(findProtectedTerm(text)).toBeUndefined(),
  );
  it("F3-50 the denylist holds at least the AC's terms", () => {
    for (const t of [
      "Chartered Accountant",
      "Chartered",
      "ACA",
      "FCA",
      "ACCA",
      "FCCA",
      "CIMA",
      "ACMA",
      "FCMA",
      "CGMA",
      "CTA",
      "Chartered Tax Adviser",
      "ATT",
      "CIOT",
      "ICAEW",
      "ICAS",
      "CPA",
      "CFA",
      "CFP",
      "IFA",
      "Independent Financial Adviser",
      "FCA authorised",
      "FCA regulated",
      "Authorised by",
      "Regulated by",
      "Member of",
    ])
      expect(PROTECTED_CREDENTIAL_TERMS as readonly string[]).toContain(t);
  });
  it("F3-50 no committed Person text contains a protected term", () => {
    const people = checkContentRules("content").entries.filter((e) => e.collection === "people");
    expect(people.length).toBeGreaterThan(0);
    for (const p of people) {
      const creds = (p.raw.credentials as { label: string }[] | undefined) ?? [];
      for (const text of [String(p.raw.role ?? ""), String(p.raw.bio ?? ""), ...creds.map((c) => c.label)])
        expect(findProtectedTerm(text), `${p.file}: ${text}`).toBeUndefined();
    }
  });
});

describe("F3-48 placeholder URLs", () => {
  const at = String.fromCharCode(64);
  it.each([
    "https://example.org/",
    "https://www.example.com/x",
    "https://data.example.net/a?b=c",
    "https://belvoir.invalid/",
    "https://EXAMPLE.ORG/",
  ])("F3-48 %s is a placeholder URL", (u) => expect(isPlaceholderUrl(u)).toBe(true));
  it.each([
    "https://belvoir-placeholder.co.uk/",
    "https://example.org.belvoir-demo.com/",
    "https://notexample.org/",
    "https://example.org.invalid.com/",
    "not a url",
  ])("F3-48 %s is not", (u) => expect(isPlaceholderUrl(u)).toBe(false));
  it("F3-48 the userinfo trick and userinfo on a placeholder host are not (built from parts, never written joined)", () => {
    const trick = `https://${"example.org"}${at}${"belvoir-demo.com"}/`;
    expect(new URL(trick).hostname).toBe("belvoir-demo.com");
    expect(new URL(trick).username).toBe("example.org");
    expect(isPlaceholderUrl(trick)).toBe(false);
    const creds = `https://${"user"}:${"pass"}${at}example.org/`;
    expect(new URL(creds).hostname).toBe("example.org");
    expect(isPlaceholderUrl(creds)).toBe(false);
  });
  it("F3-48 the committed content has exactly one active demo source, on https://example.org/", () => {
    const sources = checkContentRules("content").entries.filter((e) => e.collection === "sources");
    const active = sources.filter((s) => s.raw.status === "active");
    expect(active.map((s) => [s.raw.demo, s.raw.website])).toEqual([[true, "https://example.org/"]]);
    expect(String(active[0]?.raw.name)).toContain("(placeholder)");
  });
});

describe("F3 committed content guards", () => {
  const report = checkContentRules("content");
  it("F3-31 the committed content passes the check with no warnings", () => {
    expect(report.problems).toEqual([]);
  });
  it("F3-19 no committed credential is verified, and every label says Placeholder", () => {
    const people = report.entries.filter((e) => e.collection === "people");
    for (const p of people) {
      const creds = (p.raw.credentials as { label: string; verified?: boolean }[] | undefined) ?? [];
      expect(creds.length, p.file).toBeGreaterThan(0);
      for (const c of creds) {
        expect(c.verified, p.file).not.toBe(true);
        expect(c.label, p.file).toMatch(/Placeholder/);
      }
    }
    for (const f of walk("content", [".yaml", ".mdoc", ".json"]))
      expect(readFileSync(f, "utf8"), f).not.toMatch(/verified:\s*true/);
  });
  it("F3-34 committed content never links to gov.uk, HMRC or ONS", () => {
    for (const f of walk("content", [".yaml", ".mdoc", ".json"]))
      expect(readFileSync(f, "utf8"), f).not.toMatch(/gov\.uk|hmrc|ons\.gov/i);
  });
  it("F3-34 every committed Person is demo with a displayName starting Placeholder, and has no placeholder key", () => {
    const people = report.entries.filter((e) => e.collection === "people");
    expect(people.length).toBeGreaterThan(0);
    for (const p of people) {
      expect(p.raw.demo, p.file).toBe(true);
      expect(String(p.raw.displayName), p.file).toMatch(/^Placeholder /);
      expect("placeholder" in p.raw, p.file).toBe(false);
    }
  });
  it("F3-34 every Source a committed story cites says (placeholder) in its name", () => {
    const sources = new Map(report.entries.filter((e) => e.collection === "sources").map((e) => [e.id, e.raw]));
    for (const s of report.entries.filter((e) => e.collection === "stories"))
      for (const c of (s.raw.sources as { source: string }[] | undefined) ?? [])
        expect(String(sources.get(c.source)?.name), s.file).toContain("(placeholder)");
  });
  it("F3-20 every committed entry of a demo-bearing collection sets demo explicitly, and all are demo while D8 is open", () => {
    for (const e of report.entries.filter((x) =>
      ["stories", "topics", "tools", "people", "sources"].includes(x.collection),
    ))
      expect(e.raw.demo, e.file).toBe(true);
  });
});

describe("F3-44 pillars", () => {
  it("F3-44 PILLARS matches the PRD's pillar list in count and order", () => {
    const prd = readFileSync("docs/planning/PRD.md", "utf8");
    const section = (prd.split("## Content pillars")[1] ?? "").split("\n## ")[0] ?? "";
    const labels = [...section.matchAll(/^\d+\.\s+([^:(]+?)\s*[:(]/gm)].map((m) => m[1]);
    expect(labels).toEqual(PILLARS.map((p) => PILLAR_LABELS[p]));
    expect(PILLARS).toEqual([
      "understand-the-numbers",
      "make-better-decisions",
      "finance-in-context",
      "build-capability",
    ]);
  });
});

describe("F3-33 placeholder pages", () => {
  it("F3-33 PLACEHOLDER_PAGES is About, Contact, Privacy, Cookies and Terms, and each has a page", () => {
    expect([...PLACEHOLDER_PAGES]).toEqual(["/about/", "/contact/", "/privacy/", "/cookies/", "/terms/"]);
    for (const p of PLACEHOLDER_PAGES) expect(existsSync(`src/pages${p.slice(0, -1)}.astro`), p).toBe(true);
  });
});

/* ---------------- source scans ---------------- */

/** F3-14: every getCollection("stories") is passed straight to onlyPublished(). */
export function unfilteredStoryQueries(code: string): string[] {
  const c = strip(code);
  const out: string[] = [];
  for (const m of c.matchAll(/getCollection\(\s*["']stories["']/g)) {
    const before = c.slice(Math.max(0, m.index - 40), m.index);
    if (!/onlyPublished\(\s*(await\s+)?$/.test(before)) out.push(c.slice(m.index, m.index + 40));
  }
  if (/getEntry\(\s*["']stories["']/.test(c)) out.push("getEntry(stories)");
  return out;
}

/** F3-11: the source library never iterates or spreads over a whole Source entry. */
export function sourceSpreads(code: string): string[] {
  const c = strip(code);
  return [
    ...c.matchAll(/Object\.(entries|keys|values|assign)\s*\(|\.\.\.\s*[\w.]*(source|src|entry|data)\b[\w.]*/gi),
  ].map((m) => m[0]);
}

/** F3-25: date formatting always names a time zone. */
export function zonelessDateFormatting(code: string): string[] {
  const c = strip(code);
  const out = [...c.matchAll(/\.(toLocaleDateString|toLocaleTimeString|toDateString|toTimeString)\s*\(/g)].map(
    (m) => m[0],
  );
  for (const m of c.matchAll(/(?:\.toLocaleString|Intl\.DateTimeFormat)\s*\(/g)) {
    const call = c.slice(m.index, c.indexOf(")", m.index) + 1 || undefined);
    if (!/timeZone/.test(call)) out.push(m[0]);
  }
  return out;
}

/** F3-51: nothing reads the clock. */
export function clockReads(code: string): string[] {
  const c = strip(code);
  return [...c.matchAll(/\bDate\.now\s*\(|\bnew\s+Date\s*\(\s*\)|\bnew\s+Date\b(?!\s*\()/g)].map((m) => m[0]);
}

describe("F3 source scans", () => {
  it("F3-14 every story query in src/ goes through onlyPublished", () => {
    const offenders = walk("src").flatMap((f) =>
      unfilteredStoryQueries(readFileSync(f, "utf8")).map((o) => `${f}: ${o}`),
    );
    expect(offenders).toEqual([]);
    expect(walk("src").some((f) => /getCollection\("stories"\)/.test(readFileSync(f, "utf8")))).toBe(true);
  });
  it("F3-14 negative: an unwrapped query is caught", () => {
    expect(unfilteredStoryQueries('const s = await getCollection("stories");')).toHaveLength(1);
    expect(unfilteredStoryQueries("const s = (await getCollection('stories')).filter(x => x);")).toHaveLength(1);
    expect(unfilteredStoryQueries('const s = await getEntry("stories", id);')).toHaveLength(1);
    expect(unfilteredStoryQueries('const s = onlyPublished(await getCollection("stories"));')).toEqual([]);
  });

  it("F3-11 the source library template never spreads or iterates over a Source", () => {
    expect(sourceSpreads(readFileSync("src/pages/sources.astro", "utf8"))).toEqual([]);
  });
  it("F3-11 negative: entries, keys and spreads are caught", () => {
    expect(sourceSpreads("Object.entries(source.data).map(([k, v]) => v)")).toHaveLength(1);
    expect(sourceSpreads("Object.keys(s.data)")).toHaveLength(1);
    expect(sourceSpreads("<Entry {...source.data} />")).toHaveLength(1);
  });

  it("F3-25 no date formatting without a time zone in src/ or scripts/", () => {
    const offenders = SRC.flatMap((f) => zonelessDateFormatting(readFileSync(f, "utf8")).map((o) => `${f}: ${o}`));
    expect(offenders).toEqual([]);
  });
  it("F3-25 negative: zoneless formatting is caught, zoned formatting passes", () => {
    expect(zonelessDateFormatting("d.toLocaleDateString('en-GB')")).toHaveLength(1);
    expect(zonelessDateFormatting("d.toDateString()")).toHaveLength(1);
    expect(zonelessDateFormatting('new Intl.DateTimeFormat("en-GB", { month: "long" })')).toHaveLength(1);
    expect(zonelessDateFormatting('new Intl.DateTimeFormat("en-GB", { timeZone: "UTC" })')).toEqual([]);
  });

  it("F3-51 nothing in src/, scripts/, astro.config.mjs or src/content.config.ts reads the clock", () => {
    const files = [...SRC, "src/content.config.ts"];
    const offenders = files.flatMap((f) => clockReads(readFileSync(f, "utf8")).map((o) => `${f}: ${o}`));
    expect(offenders).toEqual([]);
  });
  it("F3-51 negative: Date.now(), new Date() and new Date are caught; new Date(value) passes", () => {
    expect(clockReads("const t = Date.now();")).toHaveLength(1);
    expect(clockReads("const d = new Date();")).toHaveLength(1);
    expect(clockReads("const d = new  Date( );")).toHaveLength(1);
    expect(clockReads("const d = new Date;")).toHaveLength(1);
    expect(clockReads('const d = new Date("2026-10-02T00:00:00Z");')).toEqual([]);
    expect(clockReads("const d = new Date(Date.UTC(2026, 9, 2));")).toEqual([]);
    expect(clockReads("// Date.now() in a comment is fine")).toEqual([]);
  });
});
