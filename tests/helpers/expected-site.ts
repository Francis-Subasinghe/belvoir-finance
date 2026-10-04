/**
 * What the built site must contain, derived from the content collections
 * (F3-01) rather than hard-coded ids, so adding a published story adds
 * exactly one expected page. Shared by tests/build on dist/ and on the
 * fixture builds.
 */
import { checkContentRules } from "../../src/lib/content-rules";
import { PLACEHOLDER_PAGES } from "../../src/config/site";

export const STATIC_PAGES = [
  "index.html",
  "explore/index.html",
  "stories/index.html",
  "tools/index.html",
  "sources/index.html",
  "about/index.html",
  "editorial-standards/index.html",
  "newsletter/index.html",
  "contact/index.html",
  "privacy/index.html",
  "cookies/index.html",
  "terms/index.html",
  "404.html",
];

const pageOf = (path: string) => `${path.replace(/^\/+/, "")}index.html`;

export interface ExpectedSite {
  pages: string[];
  /** Pages that must carry the demo banner, noindex and the marker (F3-33, F3-47). */
  demoPages: string[];
  publishedStoryIds: string[];
  unpublishedStories: { id: string; title: string }[];
  creditedPeople: string[];
}

export function expectedSite(contentDir = "content"): ExpectedSite {
  const report = checkContentRules(contentDir);
  if (report.errors.length > 0) throw new Error(`content has errors: ${report.errors.map((e) => e.message).join("; ")}`);
  const of = (c: string) => report.entries.filter((e) => e.collection === c);
  const stories = of("stories");
  const published = stories.filter((s) => s.raw["status"] === "published");
  const people = new Set<string>();
  for (const s of published) {
    people.add(String(s.raw["author"]));
    if (typeof s.raw["reviewer"] === "string" && s.raw["reviewer"]) people.add(s.raw["reviewer"]);
  }
  const entryPages = [
    ...published.map((s) => ({ page: `stories/${s.id}/index.html`, demo: s.raw["demo"] === true })),
    ...of("topics").map((t) => ({ page: `topics/${t.id}/index.html`, demo: t.raw["demo"] === true })),
    ...of("tools").map((t) => ({ page: `tools/${t.id}/index.html`, demo: t.raw["demo"] === true })),
    ...of("people")
      .filter((p) => people.has(p.id))
      .map((p) => ({ page: `people/${p.id}/index.html`, demo: p.raw["demo"] === true })),
  ];
  return {
    pages: [...STATIC_PAGES, ...entryPages.map((e) => e.page)].sort(),
    demoPages: [...PLACEHOLDER_PAGES.map(pageOf), ...entryPages.filter((e) => e.demo).map((e) => e.page)].sort(),
    publishedStoryIds: published.map((s) => s.id).sort(),
    unpublishedStories: stories
      .filter((s) => s.raw["status"] !== "published")
      .map((s) => ({ id: s.id, title: String(s.raw["title"]) })),
    creditedPeople: [...people].sort(),
  };
}
