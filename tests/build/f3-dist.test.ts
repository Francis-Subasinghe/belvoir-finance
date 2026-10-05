/** F3 assertions on the real build in dist/ (run after `npm run build`). */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { expectedSite } from "../helpers/expected-site";
import { parse } from "yaml";
import { checkContentRules } from "../../src/lib/content-rules";
import { isJsonLdScriptAttrs, nonJsonLdScriptTags } from "../helpers/html";

const DIST = "dist";
const BASE = "/belvoir-finance/";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const rel = (f: string) => relative(DIST, f).replace(/\\/g, "/");

let files: string[] = [];
let pages: { page: string; html: string }[] = [];
const html = (page: string) => pages.find((p) => p.page === page)?.html ?? "";

beforeAll(() => {
  if (!existsSync(DIST)) throw new Error("dist/ not found: run `npm run build` first");
  files = walk(DIST);
  pages = files.filter((f) => f.endsWith(".html")).map((f) => ({ page: rel(f), html: readFileSync(f, "utf8") }));
});

/** F3-04: every site-internal href/src that doesn't resolve to a file in `dist`. */
export function brokenInternalLinks(markup: string, dist: string, fromPage: string): string[] {
  const out: string[] = [];
  for (const m of markup.matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const raw = m[1] ?? "";
    if (/^(https?:|mailto:|tel:|data:|#)/.test(raw)) continue;
    let path: string;
    if (raw.startsWith(BASE)) path = raw.slice(BASE.length);
    else if (raw.startsWith("/")) {
      out.push(`${fromPage}: ${raw} (not under the base path)`);
      continue;
    } else path = join(fromPage.replace(/[^/]*$/, ""), raw);
    path = path.split("#")[0]?.split("?")[0] ?? "";
    const target = path === "" || path.endsWith("/") ? `${path}index.html` : path;
    if (!existsSync(join(dist, target))) out.push(`${fromPage}: ${raw}`);
    else if (!path.includes(".") && path !== "" && !path.endsWith("/"))
      out.push(`${fromPage}: ${raw} (no trailing slash)`);
  }
  return out;
}

describe("F3-02 page metadata", () => {
  it("F3-02 every page has a unique <title> and <meta name=description>, with the title pattern", () => {
    const titles = new Map<string, string>();
    const descs = new Map<string, string>();
    for (const { page, html: h } of pages) {
      const t = /<title>([^<]*)<\/title>/.exec(h)?.[1] ?? "";
      const d = /<meta name="description" content="([^"]*)"/.exec(h)?.[1] ?? "";
      expect(t, page).toMatch(page === "index.html" ? /^Belvoir Finance$/ : /^.+ \| Belvoir Finance$/);
      expect(d.length, page).toBeGreaterThan(20);
      expect(titles.get(t), `${page} title duplicates`).toBeUndefined();
      expect(descs.get(d), `${page} description duplicates`).toBeUndefined();
      titles.set(t, page);
      descs.set(d, page);
    }
  });
});

describe("F3-03 navigation", () => {
  it("F3-03 main nav is Home, Explore, Tools, Sources; footer links the seven pages; no Work with Belvoir", () => {
    for (const { page, html: h } of pages) {
      const nav = /<nav class="site-nav" aria-label="Main">([\s\S]*?)<\/nav>/.exec(h)?.[1] ?? "";
      expect(
        [...nav.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1]),
        page,
      ).toEqual(["Home", "Explore", "Tools", "Sources"]);
      const footer = /<nav aria-label="Footer">([\s\S]*?)<\/nav>/.exec(h)?.[1] ?? "";
      expect(
        [...footer.matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1]),
        page,
      ).toEqual(["About", "Editorial standards", "Newsletter", "Contact", "Privacy", "Cookies", "Terms"]);
      expect(h, page).not.toMatch(/work with belvoir/i);
      const current = (nav.match(/aria-current="page"/g) ?? []).length;
      const navPage = ["index.html", "explore/index.html", "tools/index.html", "sources/index.html"].includes(page);
      expect(current, page).toBe(navPage ? 1 : 0);
    }
  });
});

describe("F3-04 internal links resolve", () => {
  it("F3-04 every internal href and src in dist resolves to a file, under the base path", () => {
    expect(pages.flatMap((p) => brokenInternalLinks(p.html, DIST, p.page))).toEqual([]);
  });
  it("F3-04 negative: a link to /belvoir-finance/missing/ is reported", () => {
    const fixture = readFileSync("tests/fixtures/html/broken-link.html", "utf8");
    expect(brokenInternalLinks(fixture, DIST, "fixture/index.html")).toEqual([
      "fixture/index.html: /belvoir-finance/missing/",
    ]);
  });
});

describe("F3-08 topic pages", () => {
  const front = (file: string) => parse(readFileSync(file, "utf8").split(/^---$/m)[1] ?? "") as Record<string, unknown>;
  const stories = readdirSync("content/stories").map((n) => ({
    id: n.replace(/\.mdoc$/, ""),
    ...front(join("content/stories", n)),
  })) as {
    id: string;
    status?: string;
    topics?: string[];
  }[];
  const published = new Set(stories.filter((s) => s.status === "published").map((s) => s.id));
  const topics = readdirSync("content/topics").map((n) => ({
    id: n.replace(/\.yaml$/, ""),
    ...(parse(readFileSync(join("content/topics", n), "utf8")) as {
      title: string;
      summary: string;
      readingPath: string[];
      featuredTool?: string;
    }),
  }));
  const storyLinks = (markup: string) =>
    [...markup.matchAll(/href="\/belvoir-finance\/stories\/([^/"]+)\/"/g)].map((m) => m[1]);

  it("F3-08 one page per Topic entry with its h1, summary, ordered published reading path, featured tool and other stories", () => {
    expect(topics.length).toBeGreaterThan(0);
    for (const t of topics) {
      const h = html(`topics/${t.id}/index.html`);
      expect(h, t.id).not.toBe("");
      expect(h).toMatch(new RegExp(`<h1[^>]*>${t.title}</h1>`));
      expect(h).toContain(t.summary);
      const ol = /<ol[^>]*data-testid="reading-path"[^>]*>([\s\S]*?)<\/ol>/.exec(h)?.[1] ?? "";
      const path = t.readingPath.filter((id) => published.has(id));
      expect([...new Set(storyLinks(ol))], `${t.id} reading path`).toEqual(path);
      if (t.featuredTool) expect(h).toContain(`href="/belvoir-finance/tools/${t.featuredTool}/"`);
      const rest = h.slice(h.indexOf("</ol>"));
      const more = stories
        .filter((s) => published.has(s.id) && s.topics?.includes(t.id) && !path.includes(s.id))
        .map((s) => s.id);
      for (const id of more) expect(storyLinks(rest), `${t.id} more`).toContain(id);
      for (const s of stories.filter((x) => !published.has(x.id))) expect(h).not.toContain(`/stories/${s.id}/`);
    }
  });
});

describe("F3-12 / F3-13 editorial and placeholder pages", () => {
  it("F3-12 'independent' appears nowhere on About, Home or in the footer", () => {
    expect(html("about/index.html")).not.toMatch(/independent/i);
    expect(html("index.html")).not.toMatch(/independent/i);
    for (const { page, html: h } of pages)
      expect(/<footer[\s\S]*<\/footer>/.exec(h)?.[0] ?? "", page).not.toMatch(/independent/i);
  });
  it("F3-12 Editorial standards has an h2 for sourcing, review, corrections, AI use and disclosures", () => {
    const h2 = [...html("editorial-standards/index.html").matchAll(/<h2[^>]*>([^<]+)<\/h2>/g)].map((m) => m[1]);
    for (const want of ["Sourcing", "Review", "Corrections", "AI use", "Disclosures"]) expect(h2).toContain(want);
  });
  it("F3-12 the corrections section promises no channel and links to /contact/", () => {
    const page = html("editorial-standards/index.html");
    const corrections = page.split(">Corrections</h2>")[1]?.split("<h2")[0] ?? "";
    expect(corrections).toContain(`href="${BASE}contact/"`);
    expect(corrections).not.toMatch(/mailto:|<form|@/);
  });
  it("F3-13 Contact has no mailto, tel, email address, phone number, form or issues link", () => {
    const page = html("contact/index.html");
    const main = /<main[\s\S]*<\/main>/.exec(page)?.[0] ?? "";
    expect(main).not.toMatch(/mailto:|tel:|<form|github\.com\/[^"]*\/issues/);
    expect(main).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(main).not.toMatch(/\+?\d[\d ]{8,}\d/);
    for (const purpose of [/corrections/i, /source suggestions/i, /general/i]) expect(main).toMatch(purpose);
  });
  it("F3-13 Newsletter shows the CTA and has no form", () => {
    const page = html("newsletter/index.html");
    expect(page).not.toContain("<form");
    expect(page).not.toMatch(/<input/);
  });
  it("F3-10 the tool page is a static shell: assumptions, limitations, Illustrative only, no controls", () => {
    const page = html("tools/cash-vs-profit/index.html");
    for (const id of ["assumptions", "limitations", "illustrative-only"]) expect(page).toContain(`data-testid="${id}"`);
    expect(page).not.toMatch(/<(input|select|textarea|button|form)\b/);
  });
});

describe("F3-14 / F3-11 / F3-19 / F3-34 nothing that mustn't render does", () => {
  it("F3-14 the draft and retired fixtures (titles, ids, body markers) appear in no built file", () => {
    const { unpublishedStories } = expectedSite();
    expect(unpublishedStories.map((s) => s.id).sort()).toEqual(["draft-fixture", "retired-fixture"]);
    const needles = [
      ...unpublishedStories.flatMap((s) => [s.title, s.id]),
      "DRAFT-FIXTURE-MARKER",
      "RETIRED-FIXTURE-MARKER",
    ];
    for (const f of files) {
      const text = readFileSync(f, "latin1");
      for (const n of needles) expect(text.includes(n), `${rel(f)} contains ${n}`).toBe(false);
    }
  });
  it("F3-11 paused and retired sources and every SourceItem title and url are absent", () => {
    const report = checkContentRules("content");
    const hidden = report.entries
      .filter((e) => (e.collection === "sources" && e.raw.status !== "active") || e.collection === "sourceItems")
      .flatMap((e) => (e.collection === "sources" ? [String(e.raw.name)] : [String(e.raw.title), String(e.raw.url)]));
    expect(hidden.length).toBeGreaterThan(0);
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const n of hidden) expect(text.includes(n), `${rel(f)} contains ${n}`).toBe(false);
    }
  });
  it("F3-19 no committed (unverified) credential label appears anywhere in dist", () => {
    const labels = checkContentRules("content")
      .entries.filter((e) => e.collection === "people")
      .flatMap((e) => ((e.raw.credentials as { label: string }[] | undefined) ?? []).map((c) => c.label));
    expect(labels.length).toBeGreaterThan(0);
    for (const f of files) for (const l of labels) expect(readFileSync(f, "utf8").includes(l), rel(f)).toBe(false);
  });
  it("F3-34 no link in dist goes to gov.uk, hmrc.gov.uk or ons.gov.uk", () => {
    for (const { page, html: h } of pages)
      expect(h, page).not.toMatch(/href="https?:\/\/([^"/]*\.)?(gov\.uk|hmrc|ons\.gov)/i);
  });
  it("F3-38 dist has no .js file and no script other than JSON-LD", () => {
    expect(files.filter((f) => /\.m?js$/.test(f)).map(rel)).toEqual([]);
    for (const { page, html: h } of pages) expect(nonJsonLdScriptTags(h), page).toEqual([]);
  });
  it("F3-38 the same check catches an upper-case <SCRIPT> (CodeQL js/bad-tag-filter)", () => {
    const fixture = readFileSync("tests/fixtures/html/script-uppercase.html", "utf8");
    expect(nonJsonLdScriptTags(fixture)).toEqual(["<SCRIPT>"]);
  });
  it("F3-38 the same check catches a JSON-LD type that is only text inside another attribute", () => {
    const fixture = readFileSync("tests/fixtures/html/script-type-in-other-attribute.html", "utf8");
    expect(nonJsonLdScriptTags(fixture)).toEqual([`<script data-x='type="application/ld+json"'>`]);
  });
  it("F3-38 the real JSON-LD script on a story page passes the same check", () => {
    const story = pages.find((p) => p.page.startsWith("stories/") && p.page !== "stories/index.html");
    expect(story).toBeDefined();
    const blocks = [...(story?.html ?? "").matchAll(/<script\b([^>]*)>/gi)];
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.every((m) => isJsonLdScriptAttrs(m[1] ?? ""))).toBe(true);
    expect(nonJsonLdScriptTags(story?.html ?? "")).toEqual([]);
  });
  it("F3-49 the real build lists its active source and doesn't show the empty state", () => {
    const page = html("sources/index.html");
    expect(page).toContain('data-testid="source-list"');
    expect(page).not.toContain('data-testid="sources-empty"');
    expect(page).toContain("Example Business Research (placeholder)");
    expect(page).toMatch(/Demo/);
  });
  it("F3-43 Person pages exist only for credited people and show the placeholder flag", () => {
    const { creditedPeople } = expectedSite();
    expect(pages.filter((p) => p.page.startsWith("people/")).map((p) => p.page)).toEqual(
      creditedPeople.map((id) => `people/${id}/index.html`),
    );
    for (const id of creditedPeople)
      expect(html(`people/${id}/index.html`)).toContain('data-testid="placeholder-flag"');
  });
});
