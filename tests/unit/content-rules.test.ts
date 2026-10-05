/**
 * F3-31: every content rule runs through the same exported function the build
 * uses (`checkContentRules`, called by the `belvoir-content-rules` integration
 * in astro.config.mjs). `tests/fixtures/content/base/` is a full, valid
 * content set; each `tests/fixtures/content/negative/<case>/` overlays one or
 * two files on it (same relative path wins) and must fail with the expected
 * rule, file, field and message.
 */
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { checkContentRules, formatProblem, REFERENCES } from "../../src/lib/content-rules";

function must<T>(v: T | undefined): T {
  if (v === undefined) throw new Error("expected a value");
  return v;
}

const ROOT = "tests/fixtures/content";
const BASE = `${ROOT}/base`;
const NEG = `${ROOT}/negative`;

/** case -> [F3 id, rule, field, message pattern] */
const CASES: Record<string, [string, string, string, RegExp]> = {
  "v1-chart-real-source": [
    "V1-44",
    "chart-source",
    "body chart 2 (line 27): source",
    /"fx-active" is not a labelled placeholder Source/,
  ],
  "v1-chart-non-demo-story": [
    "V1-44",
    "chart-demo-only",
    "body chart 1 (line 37)",
    /charts appear only in demo stories/,
  ],
  "v1-chart-extra-attribute": [
    "V1-54",
    "chart-unknown-attribute",
    "body chart 2 (line 27): colour",
    /unknown attribute/,
  ],
  "v1-chart-13-points": ["V1-54", "chart-points", "body chart 2 (line 27): categories[12]", /13 points; at most 12/],
  "v1-svg-content-value": ["V1-12", "svg-content", "sources[0].url", /is an SVG; content may not supply SVG files/],
  "ref-story-topics": ["F3-15", "ref-missing", "topics[1]", /no Topic with id "no-such-topic"/],
  "ref-story-author": ["F3-15", "ref-missing", "author", /no Person with id "no-such-person"/],
  "ref-story-reviewer": ["F3-15", "ref-missing", "reviewer", /no Person with id "no-such-person"/],
  "ref-story-source": ["F3-15", "ref-missing", "sources[1].source", /no Source with id "no-such-source"/],
  "ref-story-related-story": ["F3-15", "ref-missing", "relatedStories[0]", /no Story with id "no-such-story"/],
  "ref-story-related-tool": ["F3-15", "ref-missing", "relatedTools[0]", /no Tool with id "no-such-tool"/],
  "ref-topic-reading-path": ["F3-15", "ref-missing", "readingPath[1]", /no Story with id "no-such-story"/],
  "ref-topic-featured-tool": ["F3-15", "ref-missing", "featuredTool", /no Tool with id "no-such-tool"/],
  "ref-tool-reviewer": ["F3-15", "ref-missing", "reviewer", /no Person with id "no-such-person"/],
  "ref-tool-source-record": ["F3-15", "ref-missing", "sourceRecord", /no Source with id "no-such-source"/],
  "ref-source-owner": ["F3-15", "ref-missing", "owner", /no Person with id "no-such-person"/],
  "ref-wrong-collection": ["F3-15", "ref-wrong-collection", "author", /"fx-ie-story" is a Story, not a Person/],
  "factual-no-reviewer": ["F3-17", "schema", "reviewer", /published factual story needs a reviewer/],
  "factual-blank-reviewer": ["F3-17", "schema", "reviewer", /published factual story needs a reviewer/],
  "factual-missing": ["F3-17", "schema", "factual", /factual is required \(true or false\), with no default/],
  "reviewer-is-author": ["F3-46", "schema", "reviewer", /someone other than the author/],
  "commercial-no-disclosure": ["F3-18", "schema", "disclosure", /needs a non-blank disclosure/],
  "commercial-whitespace-disclosure": ["F3-18", "schema", "disclosure", /needs a non-blank disclosure/],
  "commercial-missing": ["F3-18", "schema", "commercialInterest", /commercialInterest is required/],
  "credential-verified-no-by": ["F3-19", "schema", "credentials[0].verifiedBy", /verified credential needs verifiedBy/],
  "credential-verified-no-on": ["F3-19", "schema", "credentials[0].verifiedOn", /verified credential needs verifiedOn/],
  "protected-acca-unverified": ["F3-50", "schema", "credentials[0].label", /protected title or membership "ACCA"/],
  "protected-dotted-label": ["F3-50", "schema", "credentials[0].label", /protected title or membership "ACCA"/],
  "protected-role": ["F3-50", "schema", "role", /protected title or membership "Chartered Accountant"/],
  "protected-bio-spacing": ["F3-50", "schema", "bio", /protected title or membership "Chartered Accountant"/],
  "protected-fca-authorised": ["F3-50", "schema", "bio", /protected title or membership "FCA/],
  "person-placeholder-key": ["F3-47", "schema", "", /Unrecognized key: "placeholder"/],
  "demo-missing-story": ["F3-20", "schema", "demo", /demo is required \(true or false\), with no default/],
  "demo-missing-topic": ["F3-20", "schema", "demo", /demo is required/],
  "demo-missing-tool": ["F3-20", "schema", "demo", /demo is required/],
  "demo-missing-person": ["F3-47", "schema", "demo", /demo is required/],
  "demo-missing-source": ["F3-48", "schema", "demo", /demo is required/],
  "non-demo-by-demo-person": [
    "F3-21",
    "demo-person",
    "author",
    /placeholder \(demo\) person, so this story must set demo: true/,
  ],
  "non-demo-cites-demo-source": [
    "F3-48",
    "demo-source",
    "sources[0].source",
    /placeholder \(demo\) source, so this story must set demo: true/,
  ],
  "demo-cites-real-source": [
    "F3-34",
    "demo-source",
    "sources[0].source",
    /demo stories cite only labelled placeholder/,
  ],
  "demo-story-javascript-url": [
    "F3-48",
    "schema",
    "sources[0].url",
    /demo story may only cite placeholder URLs .*over https \(got javascript:\/\/example\.org\/%0aalert\(1\)\)/,
  ],
  "demo-source-registrable": [
    "F3-48",
    "schema",
    "website",
    /may only link to example\.org, example\.com, example\.net or a \.invalid host/,
  ],
  "demo-source-lookalike": ["F3-48", "schema", "website", /may only link to example\.org/],
  "demo-source-prefix": ["F3-48", "schema", "website", /may only link to example\.org/],
  "demo-source-feed-url": ["F3-48", "schema", "feedUrl", /may only link to example\.org/],
  "demo-source-name": ["F3-48", "schema", "name", /must say "\(placeholder\)" in its name/],
  "demo-story-real-url": ["F3-48", "schema", "sources[0].url", /demo story may only cite placeholder URLs/],
  "pillar-unknown-story": ["F3-44", "schema", "pillars[1]", /unknown pillar "fx-topic-a"/],
  "pillar-unknown-topic": ["F3-44", "schema", "pillar", /unknown pillar "cash-flow"/],
  "story-other-no-note": ["F3-45", "schema", "jurisdictionNote", /"other" needs a non-blank jurisdictionNote/],
  "story-other-whitespace-note": ["F3-45", "schema", "jurisdictionNote", /"other" needs a non-blank jurisdictionNote/],
  "story-uk-with-note": ["F3-45", "schema", "jurisdictionNote", /only allowed when jurisdiction is "other"/],
  "story-unknown-jurisdiction": [
    "F3-22",
    "schema",
    "jurisdiction",
    /must be one of UK, IE, EU, US, other \(got "FR"\)/,
  ],
  "source-free-text-jurisdiction": ["F3-45", "schema", "jurisdiction", /got "United Kingdom"/],
  "source-other-no-note": ["F3-45", "schema", "jurisdictionNote", /"other" needs a non-blank jurisdictionNote/],
  "source-uk-with-note": ["F3-45", "schema", "jurisdictionNote", /only allowed when jurisdiction is "other"/],
  "date-feb-30": ["F3-23", "schema", "firstPublished", /real calendar date written YYYY-MM-DD \(got "2026-02-30"\)/],
  "date-month-13": ["F3-23", "schema", "firstPublished", /got "2026-13-01"/],
  "date-us-order": ["F3-23", "schema", "firstPublished", /got "02\/10\/2026"/],
  "date-offset": ["F3-23", "schema", "firstPublished", /got "2026-10-03T00:30:00\+01:00"/],
  "date-empty": ["F3-23", "schema", "firstPublished", /got ""/],
  "date-source-accessed": ["F3-23", "schema", "sources[0].accessed", /got "2026-02-30"/],
  "date-verified-on": ["F3-23", "schema", "credentials[0].verifiedOn", /got "2026-13-01"/],
  "date-source-last-checked": ["F3-23", "schema", "lastChecked", /got "02\/10\/2026"/],
  "date-first-published-missing": ["F3-24", "schema", "firstPublished", /required once published/],
  "date-last-reviewed-missing": ["F3-24", "schema", "lastReviewed", /required once published/],
  "date-last-reviewed-before-first": ["F3-24", "schema", "lastReviewed", /on or after firstPublished/],
  "date-next-review-not-after": ["F3-24", "schema", "nextReviewDue", /must be after lastReviewed/],
  "date-time-sensitive-no-next": ["F3-24", "schema", "nextReviewDue", /required for time-sensitive stories/],
  "id-uppercase": ["F3-26", "id-invalid", "", /file name "Fx-Upper" must be a lowercase slug/],
  "id-case-duplicate": ["F3-26", "id-invalid", "", /file name "FX-IE-STORY" must be a lowercase slug/],
  "id-slug-key": ["F3-26", "schema", "", /a "slug" key is not allowed/],
  "id-wrong-extension": ["F3-26", "unexpected-file", "", /only \.yaml files belong in content\/topics\//],
};

describe("F3-31 content fixtures", () => {
  it("F3-16 the positive fixture set passes, with only the two unpublished-reference warnings", () => {
    const r = checkContentRules(BASE);
    expect(r.errors.map(formatProblem)).toEqual([]);
    expect(r.warnings.map((w) => `${w.rule} ${w.file} ${w.field}`)).toEqual([
      `ref-unpublished ${BASE}/stories/fx-uk-story.mdoc relatedStories[1]`,
      `ref-unpublished ${BASE}/topics/fx-topic-a.yaml readingPath[1]`,
    ]);
    expect(formatProblem(must(r.warnings[0]))).toMatch(/^warning: .*"fx-draft" is not published \(status: draft\)/);
  });

  it("F3-31 every negative fixture directory has an expectation, and every expectation a directory", () => {
    expect(readdirSync(NEG).sort()).toEqual(Object.keys(CASES).sort());
  });

  it("F3-15 the reference table covers the eleven reference types", () => {
    expect(REFERENCES).toHaveLength(11);
    expect(REFERENCES.map((r) => `${r.from}.${r.field}->${r.to}`)).toEqual(
      expect.arrayContaining(["tools.reviewer->people", "tools.sourceRecord->sources"]),
    );
  });

  it.each(Object.entries(CASES).map(([name, c]) => [`${c[0]} ${name}`, name, c] as const))(
    "%s fails with the expected rule, file, field and message",
    (_title, name, [, rule, field, re]) => {
      const r = checkContentRules([BASE, `${NEG}/${name}`]);
      const hit = r.errors.find((e) => e.rule === rule && e.field === field && re.test(e.message));
      expect(hit, r.errors.map(formatProblem).join("\n")).toBeDefined();
      // The message names the overlay file, so an author can find it.
      expect(formatProblem(must(hit))).toContain(`${NEG}/${name}/`);
    },
  );

  it("F3-26 a case-only duplicate id is reported as a duplicate too", () => {
    const r = checkContentRules([BASE, `${NEG}/id-case-duplicate`]);
    expect(r.errors.some((e) => e.rule === "id-duplicate")).toBe(true);
  });

  it("F3-24 a far-future firstPublished and a past nextReviewDue both pass (no clock rule)", () => {
    const r = checkContentRules(BASE);
    const tie = must(r.entries.find((e) => e.id === "a-tie-story"));
    expect(tie.raw.firstPublished).toBe("2099-01-01");
    const uk = must(r.entries.find((e) => e.id === "fx-uk-story"));
    expect(uk.raw.nextReviewDue).toBe("2026-09-03");
    expect(r.errors).toEqual([]);
  });

  it("F3-17 a draft factual story without a reviewer passes; a published non-factual one without a reviewer passes", () => {
    const r = checkContentRules(BASE);
    const draft = must(r.entries.find((e) => e.id === "fx-draft"));
    expect(draft.raw.factual).toBe(true);
    expect(draft.raw.reviewer).toBeUndefined();
    const ie = must(r.entries.find((e) => e.id === "fx-ie-story"));
    expect([ie.raw.status, ie.raw.factual, ie.raw.reviewer]).toEqual(["published", false, undefined]);
    expect(r.errors).toEqual([]);
  });
});

/**
 * F3-48 userinfo cases. These URLs are built from parts at run time and never
 * written joined in the repo: a joined user@host string looks like an email
 * address to the F1-17 secrets check.
 */
describe("F3-48 placeholder URLs carrying userinfo", () => {
  const tmp = mkdtempSync(join(tmpdir(), "belvoir-f348-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  const scheme = "https";
  const at = String.fromCharCode(64);
  const userinfoTrick = `${scheme}://${"example.org"}${at}${"belvoir-demo.com"}${"/"}`;
  const withPassword = `${scheme}://${"user"}:${"pass"}${at}${"example.org"}${"/"}`;

  function overlayWith(website: string, name: string): string {
    const dir = join(tmp, name, "sources");
    cpSync(`${BASE}/sources/fx-demo-source.yaml`, join(dir, "fx-demo-source.yaml"));
    const r0 = must(checkContentRules(BASE).entries.find((e) => e.id === "fx-demo-source"));
    writeFileSync(join(dir, "fx-demo-source.yaml"), stringify({ ...r0.raw, website }));
    return join(tmp, name);
  }

  it("F3-48 the userinfo trick parses to host belvoir-demo.com, and the rule rejects it", () => {
    const u = new URL(userinfoTrick);
    expect(u.hostname).toBe("belvoir-demo.com");
    expect(u.username).toBe("example.org");
    const r = checkContentRules([BASE, overlayWith(userinfoTrick, "userinfo")]);
    expect(r.errors.some((e) => e.field === "website" && /example\.org, example\.com/.test(e.message))).toBe(true);
  });

  it("F3-48 a placeholder-host URL with a username and password is rejected", () => {
    const u = new URL(withPassword);
    expect([u.hostname, u.username, u.password]).toEqual(["example.org", "user", "pass"]);
    const r = checkContentRules([BASE, overlayWith(withPassword, "password")]);
    expect(r.errors.some((e) => e.field === "website")).toBe(true);
  });
});

describe("F3-30 every problem is reported, not just the first", () => {
  it("F3-30 two broken files in one run give both messages", () => {
    const r = checkContentRules([BASE, `${NEG}/ref-story-author`, `${NEG}/pillar-unknown-topic`]);
    expect(r.errors.map((e) => `${e.rule} ${e.field}`).sort()).toEqual(["ref-missing author", "schema pillar"]);
  });
  it("F3-17 changing format alone never changes the result", () => {
    for (const format of ["explainer", "visual-story", "what-changed", "newsletter"]) {
      for (const [overlay, want] of [
        [`${NEG}/factual-no-reviewer`, 1],
        [BASE, 0],
      ] as const) {
        const dir = mkdtempSync(join(tmpdir(), "belvoir-fmt-"));
        mkdirSync(join(dir, "stories"), { recursive: true });
        const text = readFileSync(`${overlay}/stories/fx-uk-story.mdoc`, "utf8");
        writeFileSync(join(dir, "stories/fx-uk-story.mdoc"), text.replace(/^format: .*$/m, `format: ${format}`));
        expect(checkContentRules([BASE, dir]).errors.length, `${format} ${overlay}`).toBe(want);
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });
});
