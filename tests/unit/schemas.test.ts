import { describe, expect, it } from "vitest";
import {
  personSchema,
  sourceItemSchema,
  sourceSchema,
  STATUSES,
  storySchema,
  topicSchema,
} from "../../src/content/schemas";

const validStory = {
  title: "A story",
  summary: "One sentence.",
  format: "explainer",
  reader: "Founders",
  level: "beginner",
  author: "placeholder-author",
  firstPublished: "2026-10-02",
  demo: true,
  status: "published",
};

describe("F1-09 story schema", () => {
  it("accepts a valid story and defaults jurisdiction to UK", () => {
    const s = storySchema.parse(validStory);
    expect(s.jurisdiction).toBe("UK");
    expect(s.demo).toBe(true);
  });

  it("has exactly the five CONTENT_MODEL statuses", () => {
    expect(STATUSES).toEqual(["draft", "review", "approved", "published", "retired"]);
  });

  it.each(["title", "summary", "format", "reader", "level", "author", "status"])(
    "rejects a story missing required field %s",
    (field) => {
      const bad = Object.fromEntries(Object.entries(validStory).filter(([k]) => k !== field));
      expect(storySchema.safeParse(bad).success).toBe(false);
    },
  );

  it("rejects an invalid status", () => {
    expect(storySchema.safeParse({ ...validStory, status: "live" }).success).toBe(false);
  });

  it("F1-29: demo is a boolean", () => {
    expect(storySchema.safeParse({ ...validStory, demo: "yes" }).success).toBe(false);
    expect(storySchema.parse({ ...validStory, demo: undefined }).demo).toBe(false);
  });

  it("requires nextReviewDue for time-sensitive stories", () => {
    expect(storySchema.safeParse({ ...validStory, timeSensitive: true }).success).toBe(false);
    expect(storySchema.safeParse({ ...validStory, timeSensitive: true, nextReviewDue: "2027-01-01" }).success).toBe(
      true,
    );
  });

  it("requires https source URLs", () => {
    const sources = [{ source: "x", url: "http://example.org/", accessed: "2026-10-01" }];
    expect(storySchema.safeParse({ ...validStory, sources }).success).toBe(false);
  });
});

describe("F1-09 other collections", () => {
  it("rejects a topic without a title", () => {
    expect(topicSchema.safeParse({ summary: "s", pillar: "p" }).success).toBe(false);
  });

  it("rejects a person without a display name", () => {
    expect(personSchema.safeParse({ role: "r" }).success).toBe(false);
  });

  const source = {
    name: "n",
    publisher: "p",
    category: "primary-official",
    jurisdiction: "UK",
    website: "https://www.example.org/",
    feedType: "none",
    updateFrequency: "weekly",
    rights: "unknown",
    role: "primary",
    owner: "placeholder-reviewer",
    lastChecked: "2026-10-02",
    status: "paused",
  };

  it("accepts a valid source and rejects bad status / non-https feed", () => {
    expect(sourceSchema.safeParse(source).success).toBe(true);
    expect(sourceSchema.safeParse({ ...source, status: "live" }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...source, feedUrl: "http://example.org/feed" }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...source, feedUrl: "file:///etc/passwd" }).success).toBe(false);
  });

  it("caps source item title at 300 and excerpt at 500 characters", () => {
    const item = {
      sourceId: "s",
      title: "t",
      url: "https://www.example.org/x",
      publishedAt: "2026-10-01",
      fetchedAt: "2026-10-02",
      status: "queued",
    };
    expect(sourceItemSchema.safeParse(item).success).toBe(true);
    expect(sourceItemSchema.safeParse({ ...item, title: "x".repeat(301) }).success).toBe(false);
    expect(sourceItemSchema.safeParse({ ...item, excerpt: "x".repeat(501) }).success).toBe(false);
    expect(sourceItemSchema.safeParse({ ...item, status: "published" }).success).toBe(false);
  });
});
