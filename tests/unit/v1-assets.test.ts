/**
 * V1-02 / V1-03 manifest guard fixtures and V1-43 (no cover or image field).
 * The real src/assets/ manifest is checked in v1-assets-real.test.ts.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { COLLECTIONS } from "../../src/content/schemas";
import { manifestProblems, readManifest } from "../helpers/v1-assets";

const FX = "tests/fixtures/v1/manifest";
const check = (d: string) => manifestProblems(readManifest(`${FX}/${d}/assets.json`), `${FX}/${d}`);

describe("V1-02 asset manifest guard", () => {
  it("V1-02 the positive fixture passes", () => {
    expect(check("positive")).toEqual([]);
  });
  it("V1-02 an SVG not listed in the manifest fails", () => {
    expect(check("unlisted")).toEqual([`${FX}/unlisted/b.svg: not in the manifest`]);
  });
  it("V1-02 a wrong sha256 fails", () => {
    expect(check("wrong-hash")).toEqual([`${FX}/wrong-hash/a.svg: sha256 differs from the manifest`]);
  });
  it("V1-03 a wrong licence, author or method fails", () => {
    const [row] = readManifest(`${FX}/positive/assets.json`);
    if (!row) throw new Error("fixture row");
    const bad = [{ ...row, licence: "CC-BY-4.0", author: "Someone", method: "downloaded" }];
    expect(manifestProblems(bad, `${FX}/positive`)).toHaveLength(3);
  });
});

/** The F3 field set of each collection (F3-27). V1 adds none (Q-2). */
const F3_FIELDS: Record<string, string> = {
  stories:
    "title,summary,format,pillars,topics,reader,level,author,reviewer,firstPublished,lastReviewed,nextReviewDue,timeSensitive,jurisdiction,jurisdictionNote,period,sources,relatedStories,relatedTools,disclosure,factual,commercialInterest,demo,status",
  topics: "title,summary,pillar,readingPath,featuredTool,demo",
  people: "displayName,role,bio,demo,credentials",
  tools: "title,summary,assumptions,limitations,reviewer,sourceRecord,usesOfficialValues,demo",
  newsletterCtas: "heading,valueProp,cadence,placement",
  sources:
    "name,publisher,category,topics,jurisdiction,jurisdictionNote,website,feedUrl,feedType,updateFrequency,rights,rightsNotes,role,owner,lastChecked,editorialNotes,demo,status",
  sourceItems: "sourceId,title,url,publishedAt,fetchedAt,excerpt,status,usedInStory",
};

const fieldsOf = (schema: z.ZodType): string[] => {
  const js = z.toJSONSchema(schema, { unrepresentable: "any", io: "input" }) as { properties?: object };
  return Object.keys(js.properties ?? {});
};

describe("V1-43 no cover field", () => {
  it.each(Object.entries(COLLECTIONS))("V1-43 %s keeps exactly its F3 fields", (name, c) => {
    expect(fieldsOf(c.schema as z.ZodType).join(",")).toBe(F3_FIELDS[name]);
  });
  it("V1-43 no collection has a cover, image, thumbnail, hero, art or icon field", () => {
    for (const c of Object.values(COLLECTIONS))
      expect(
        fieldsOf(c.schema as z.ZodType).filter((k) => /cover|image|thumb|hero|art$|icon|illustration/i.test(k)),
      ).toEqual([]);
  });
  it("V1-43 / V1-12 keystatic.config.ts has no image or file field and Markdoc images stay off", () => {
    const k = readFileSync("keystatic.config.ts", "utf8");
    expect(k).not.toMatch(/fields\s*\.\s*(image|file|cloudImage)\s*\(/);
    expect(k).toMatch(/options:\s*\{\s*image:\s*false\s*\}/);
  });
});
