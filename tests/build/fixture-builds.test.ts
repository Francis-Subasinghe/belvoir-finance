/**
 * F3 checks that need their own build: `astro build` on temporary copies of
 * the repo with fixture content (tests/fixtures/content/). The rich positive
 * set (base/) exercises every rendering rule; overlays prove the empty
 * Source library (F3-49) and that each rule family fails the real build
 * (F3-31); two faked-clock builds prove the output never depends on the date
 * or time zone (F3-51).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { expectedSite } from "../helpers/expected-site";
import { astroBuild, FAKE_CLOCK, hashTree, makeSite, type Site, walkFiles } from "../helpers/fixture-build";
import { scriptBlocks } from "../helpers/html";

const FX = "tests/fixtures/content";
const BASE = `${FX}/base`;
const T = 180_000;

function read(site: Site, page: string): string {
  return readFileSync(join(site.dist, page), "utf8");
}
function allText(site: Site): { file: string; text: string }[] {
  return walkFiles(site.dist).map((f) => ({ file: relative(site.dist, f), text: readFileSync(f, "latin1") }));
}
const filesContaining = (site: Site, needle: string) =>
  allText(site)
    .filter((f) => f.text.includes(needle))
    .map((f) => f.file);

describe("F3 rich fixture build (tests/fixtures/content/base)", () => {
  let site: Site;
  let output = "";
  beforeAll(() => {
    site = makeSite([BASE]);
    const r = astroBuild(site);
    if (r.status !== 0) throw new Error(`fixture build failed:\n${r.output}`);
    output = r.output;
  }, T);
  afterAll(() => site?.cleanup());

  it("F3-01 builds exactly the expected pages for the fixture content", () => {
    const rel = walkFiles(site.dist)
      .filter((f) => f.endsWith(".html"))
      .map((f) => relative(site.dist, f))
      .sort();
    expect(rel).toEqual(expectedSite(BASE).pages);
  });

  it("F3-16 the build prints the unpublished-reference warnings (file, field, id) and still succeeds", () => {
    expect(output).toMatch(/fx-uk-story\.mdoc: relatedStories\[1\]: "fx-draft" is not published/);
    expect(output).toMatch(/fx-topic-a\.yaml: readingPath\[1\]: "fx-draft" is not published/);
    expect(read(site, "stories/fx-uk-story/index.html")).toContain("Fixture UK story");
  });

  it("F3-14 the draft and retired stories appear in no built file, and nothing links to them", () => {
    for (const m of [
      "FX-DRAFT-TITLE-MARKER",
      "FX-DRAFT-BODY-MARKER",
      "FX-RETIRED-TITLE-MARKER",
      "FX-RETIRED-BODY-MARKER",
    ])
      expect(filesContaining(site, m), m).toEqual([]);
    expect(filesContaining(site, "/stories/fx-draft/")).toEqual([]);
    expect(filesContaining(site, "/stories/fx-retired/")).toEqual([]);
  });

  it("F3-22 non-UK stories show their jurisdiction label on the story page and on every card", () => {
    const labels: [string, string][] = [
      ["fx-ie-story", "Jurisdiction: Ireland"],
      ["fx-eu-story", "Jurisdiction: European Union"],
      ["fx-us-story", "Jurisdiction: United States"],
      ["fx-other-story", "Jurisdiction: Other jurisdiction (OTHER-NOTE-MARKER territory)"],
    ];
    const index = read(site, "stories/index.html");
    for (const [id, label] of labels) {
      expect(read(site, `stories/${id}/index.html`), id).toContain(label);
      expect(index, id).toContain(label);
    }
    const ukHeader = read(site, "stories/fx-uk-story/index.html")
      .split('data-testid="article-header"')[1]
      ?.split("</dl>")[0];
    expect(ukHeader).toBeDefined();
    expect(ukHeader).not.toContain('data-testid="jurisdiction-label"');
  });

  it("F3-39 script and HTML in title, summary and disclosure render inert on the page, cards and JSON-LD", () => {
    for (const page of ["stories/fx-xss-story/index.html", "stories/index.html", "explore/index.html"]) {
      const html = read(site, page);
      expect(html, page).not.toContain("<script>alert(1)</script>");
      // Inside a quoted attribute value (e.g. the meta description) "<img" is just text.
      const markup = html.replace(/="[^"]*"/g, '=""');
      expect(markup, page).not.toMatch(/<img[^>]*onerror/i);
      expect(html, page).toContain("XSS-TITLE-MARKER");
      for (const b of scriptBlocks(html)) expect(b.attrs, page).toMatch(/application\/ld\+json/);
    }
    const story = read(site, "stories/fx-xss-story/index.html");
    expect(story).toContain("&lt;img src=x onerror=alert(1)&gt; XSS-SUMMARY-MARKER");
    expect(story).toContain("DISCLOSURE-MARKER");
    const ld = scriptBlocks(story)
      .map((b) => b.body)
      .join("");
    expect(ld).not.toMatch(/[<>]/);
    expect(JSON.parse(scriptBlocks(story)[0]?.body ?? "{}").headline).toContain("</script><script>alert(1)</script>");
  });

  it("F3-06 the featured story is the newest; a date tie goes to the alphabetically first id", () => {
    const home = read(site, "index.html");
    const featured = home.split('data-testid="featured-story"')[1]?.split("</section>")[0] ?? "";
    expect(featured).toContain("/stories/a-tie-story/");
    expect(featured).not.toContain("/stories/b-tie-story/");
  });

  it("F3-24 a far-future firstPublished and a past nextReviewDue build normally", () => {
    expect(read(site, "stories/a-tie-story/index.html")).toContain('datetime="2099-01-01"');
    expect(read(site, "stories/fx-uk-story/index.html")).toContain("Fixture UK story");
  });

  it("F3-07 Explore puts a multi-topic story in each topic, and topic-less stories under Other stories", () => {
    const explore = read(site, "explore/index.html");
    const section = (id: string) => explore.split(`id="topic-${id}"`)[1]?.split("</section>")[0] ?? "";
    expect(section("fx-topic-a")).toContain("/stories/fx-uk-story/");
    expect(section("fx-topic-b")).toContain("/stories/fx-uk-story/");
    expect(section("other-stories")).toContain("/stories/a-tie-story/");
    expect(section("other-stories")).toContain("/stories/b-tie-story/");
    expect(explore).toContain("Other stories");
  });

  it("F3-11 the Source library hides feedUrl, editorialNotes, rightsNotes, owner, paused sources and SourceItems", () => {
    for (const m of [
      "feed-marker-k3j",
      "EDITORIAL-MARKER-K3J",
      "RIGHTS-MARKER-K3J",
      "owner-marker-q7x",
      "PAUSED-SOURCE-MARKER",
      "SOURCEITEM-TITLE-MARKER",
      "sourceitem-marker.example.com",
    ])
      expect(filesContaining(site, m), m).toEqual([]);
    const sources = read(site, "sources/index.html");
    expect(sources).toContain("Fixture Active Source");
    expect(sources).toContain("Fixture Demo Source (placeholder)");
    expect(sources).not.toContain('data-testid="sources-empty"');
  });

  it("F3-19 only verified credentials render: on the Person page and the story byline", () => {
    expect(filesContaining(site, "UNVERIFIED-CREDENTIAL-MARKER")).toEqual([]);
    expect(read(site, "people/fx-author/index.html")).toContain("VERIFIED-CREDENTIAL-MARKER");
    expect(read(site, "stories/fx-uk-story/index.html")).toContain("VERIFIED-CREDENTIAL-MARKER");
  });

  it("F3-43 a Person page exists only for people credited on a published story", () => {
    expect(expectedSite(BASE).creditedPeople.sort()).toEqual(["fx-author", "fx-placeholder", "fx-reviewer"]);
    expect(filesContaining(site, "/people/owner-marker-q7x/")).toEqual([]);
  });

  it("F3-33 demo stories, topics and people are marked; non-demo ones are not", () => {
    const marker = '<meta name="belvoir-demo" content="true">';
    expect(read(site, "stories/a-tie-story/index.html")).toContain(marker);
    expect(read(site, "people/fx-placeholder/index.html")).toContain(marker);
    expect(read(site, "topics/fx-topic-b/index.html")).toContain(marker);
    expect(read(site, "stories/fx-uk-story/index.html")).not.toContain(marker);
    expect(read(site, "people/fx-author/index.html")).not.toContain(marker);
    expect(read(site, "stories/a-tie-story/index.html")).toContain('data-testid="placeholder-flag"');
  });
});

describe("F3-49 empty Source library (no active sources)", () => {
  let site: Site;
  beforeAll(() => {
    site = makeSite([BASE, `${FX}/overlays/no-active-sources`]);
    const r = astroBuild(site);
    if (r.status !== 0) throw new Error(`fixture build failed:\n${r.output}`);
  }, T);
  afterAll(() => site?.cleanup());

  it("F3-49 /sources/ keeps its h1 and intro and shows the designed empty state, with no empty list", () => {
    const html = read(site, "sources/index.html");
    expect(html).toMatch(/<h1[^>]*>Source library<\/h1>/);
    expect(html).toContain('data-testid="sources-empty"');
    expect(html).toContain('class="status-notice');
    expect(html).not.toContain('data-testid="source-list"');
    expect(html).not.toMatch(/<ul[^>]*>\s*<\/ul>/);
    expect(html).not.toContain("<table");
    expect(html).toMatch(/<title>[^<]+<\/title>/);
    expect(html).toMatch(/<meta name="description" content="[^"]+"/);
  });
});

/** One failing build per rule family, through the real astro build (F3-31). */
const FAILING: [string, string, RegExp][] = [
  ["F3-15 references", "ref-story-author", /stories\/fx-uk-story\.mdoc: author: no Person with id "no-such-person"/],
  [
    "F3-17 CF-02 factual needs a reviewer",
    "factual-no-reviewer",
    /fx-uk-story\.mdoc: reviewer: a published factual story needs a reviewer/,
  ],
  [
    "F3-46 reviewer is not the author",
    "reviewer-is-author",
    /fx-ie-story\.mdoc: reviewer: the reviewer must be someone other than the author/,
  ],
  ["F3-19 credentials", "credential-verified-no-by", /fx-reviewer\.yaml: credentials\[0\]\.verifiedBy/],
  [
    "F3-50 protected titles",
    "protected-acca-unverified",
    /fx-reviewer\.yaml: credentials\[0\]\.label: contains the protected title or membership "ACCA"/,
  ],
  ["F3-21 demo people", "non-demo-by-demo-person", /fx-ie-story\.mdoc: author: .*must set demo: true/],
  [
    "F3-48 placeholder domains",
    "demo-source-lookalike",
    /fx-demo-source\.yaml: website: a placeholder \(demo\) source may only link/,
  ],
  ["F3-44 pillars", "pillar-unknown-topic", /fx-topic-a\.yaml: pillar: unknown pillar "cash-flow"/],
  ["F3-45 jurisdiction", "story-other-no-note", /fx-other-story\.mdoc: jurisdictionNote/],
  ["F3-23 dates", "date-feb-30", /fx-ie-story\.mdoc: firstPublished: must be a real calendar date/],
  ["F3-24 date order", "date-next-review-not-after", /fx-uk-story\.mdoc: nextReviewDue: must be after lastReviewed/],
  ["F3-26 ids", "id-slug-key", /fx-slug-collision\.mdoc: a "slug" key is not allowed/],
];

describe("F3-31 each rule family fails astro build on a temporary copy", () => {
  it.each(FAILING)(
    "%s: astro build exits non-zero with the file, field and message",
    (_name, fixture, message) => {
      const site = makeSite([BASE, `${FX}/negative/${fixture}`]);
      try {
        const r = astroBuild(site);
        expect(r.status, r.output).not.toBe(0);
        expect(r.output).toMatch(message);
        expect(r.output).toMatch(/content check failed/i);
      } finally {
        site.cleanup();
      }
    },
    T,
  );
});

describe("F3-51 the build doesn't depend on the system date or time zone", () => {
  it("F3-51 the fake clock preload really moves the clock and the zone", () => {
    const r = spawnSync(
      process.execPath,
      [
        "--import",
        FAKE_CLOCK,
        "-e",
        "console.log(new Date().toISOString(), Date.now(), new Date().getTimezoneOffset())",
      ],
      { env: { ...process.env, FAKE_NOW: "2031-07-15T12:00:00Z", TZ: "Pacific/Kiritimati" }, encoding: "utf8" },
    );
    const [iso, now, tz] = r.stdout.trim().split(" ");
    expect(iso?.slice(0, 13)).toBe("2031-07-15T12");
    expect(Math.abs(Number(now) - Date.parse("2031-07-15T12:00:00Z"))).toBeLessThan(60_000);
    expect(tz).toBe("-840");
  });

  it(
    "F3-51 / F3-25 builds of the committed content faked to four dates and zones (UTC, UTC+14, Los Angeles, London in BST) are byte-identical",
    () => {
      const runs = [
        { FAKE_NOW: "2026-01-01T00:00:00Z", TZ: "UTC" },
        { FAKE_NOW: "2031-07-15T12:00:00Z", TZ: "Pacific/Kiritimati" },
        { FAKE_NOW: "2029-03-31T23:30:00Z", TZ: "America/Los_Angeles" },
        // F3-25: Europe/London during BST.
        { FAKE_NOW: "2027-07-01T23:30:00Z", TZ: "Europe/London" },
      ];
      const trees = runs.map((env) => {
        const site = makeSite(["content"]);
        try {
          const r = astroBuild(site, env, ["--import", FAKE_CLOCK]);
          expect(r.status, r.output).toBe(0);
          expect(r.output).toContain(`fake-clock: now=${env.FAKE_NOW.slice(0, 13)}`);
          return hashTree(site.dist);
        } finally {
          site.cleanup();
        }
      });
      expect(Object.keys(trees[0] ?? {}).length).toBeGreaterThan(15);
      expect(trees[1]).toEqual(trees[0]);
      expect(trees[2]).toEqual(trees[0]);
      expect(trees[3]).toEqual(trees[0]);
    },
    T * 2,
  );
});

describe("F3-33 demo marking in a PUBLIC_PREVIEW=false build (the one Lighthouse uses)", () => {
  let site: Site;
  beforeAll(() => {
    site = makeSite(["content"]);
    const r = astroBuild(site, { PUBLIC_PREVIEW: "false" });
    if (r.status !== 0) throw new Error(`build failed:\n${r.output}`);
  }, T);
  afterAll(() => site?.cleanup());

  it("F3-33 demo and placeholder pages stay noindex with the marker and banner; other pages are index, follow", () => {
    const { pages, demoPages } = expectedSite();
    const demo = new Set(demoPages);
    for (const page of pages.filter((p) => p !== "404.html")) {
      const html = read(site, page);
      const robots = /<meta name="robots" content="([^"]+)"/.exec(html)?.[1];
      if (demo.has(page)) {
        expect(robots, page).toBe("noindex, nofollow");
        expect(html.split('<meta name="belvoir-demo" content="true">').length - 1, page).toBe(1);
        expect(html, page).toContain('data-testid="demo-banner"');
      } else {
        expect(robots, page).toBe("index, follow");
        expect(html, page).not.toContain("belvoir-demo");
        expect(html, page).not.toContain('data-testid="demo-banner"');
      }
    }
    expect(pages.filter((p) => !demo.has(p)).length).toBeGreaterThan(3);
  });
});
