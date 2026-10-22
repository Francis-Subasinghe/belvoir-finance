/** F5-03, F5-06, F5-07, F5-10, F5-49: per-entry Source and SourceItem rules. */
import { describe, expect, it } from "vitest";
import {
  isLastError,
  LAST_ERROR_CODES,
  LAST_ERROR_PATTERN,
  parseOffsetDateTime,
  sourceItemSchema,
  sourceSchema,
} from "../../../src/lib/sources/schema.ts";

const item = {
  sourceId: "fx-active",
  title: "A title",
  url: "https://www.example.org/a",
  publishedAt: "2026-10-06T09:30:15+01:00",
  fetchedAt: "2026-10-06T10:00:00Z",
  status: "queued",
};
const source = {
  name: "Real Source",
  publisher: "Real Publisher",
  category: "primary-official",
  jurisdiction: "UK",
  website: "https://www.fixture-source.test/",
  feedType: "rss",
  feedUrl: "https://feeds.fixture-source.test/rss",
  updateFrequency: "weekly",
  rights: "unknown",
  role: "primary",
  owner: "placeholder-reviewer",
  lastChecked: "2026-10-23",
  demo: false,
  status: "paused",
};

describe("F5-06 datetimes with an offset", () => {
  it("F5-06 round trip: 2026-10-06T09:30:15+01:00 is the instant 08:30:15 UTC, minutes and seconds kept", () => {
    const r = sourceItemSchema.parse(item);
    expect((r.publishedAt as Date).toISOString()).toBe("2026-10-06T08:30:15.000Z");
    expect(parseOffsetDateTime("2026-10-06T09:30:15+01:00")).toEqual({
      ms: Date.UTC(2026, 9, 6, 8, 30, 15),
      fraction: false,
    });
  });
  it.each([
    "2026-10-06",
    "2026-10-06T09:30:00",
    "2026-02-30T10:00:00Z",
    "2026-10-06T24:00:00Z",
    "06/10/2026 09:30",
    "",
  ])("F5-06 negative %j is rejected for publishedAt and fetchedAt", (v) => {
    expect(sourceItemSchema.safeParse({ ...item, publishedAt: v }).success).toBe(false);
    expect(sourceItemSchema.safeParse({ ...item, fetchedAt: v }).success).toBe(false);
  });
});

describe("F5-07 lastError", () => {
  it("F5-07 the code list is the E table (18 codes, http-<status> pattern)", () => {
    expect(LAST_ERROR_CODES).toHaveLength(18);
    for (const ok of ["http-500", "http-404", "timeout", "bad-host", "bad-content-encoding", "not-in-registry"])
      expect(isLastError(ok), ok).toBe(true);
  });
  it.each([
    "http-500 https://feeds.example.invalid/a",
    "http-500?token=abc",
    `${"ghp"}_${"b".repeat(36)}`,
    "Server said: internal error",
    "xtimeout",
    "timeoutx",
    "http-5000",
    "http-",
    "a".repeat(33),
  ])("F5-07 negative %j is not a lastError", (v) => {
    expect(isLastError(v)).toBe(false);
  });
  it("F5-07 the regex is anchored at both ends (M-27)", () => {
    expect(LAST_ERROR_PATTERN.source.startsWith("^")).toBe(true);
    expect(LAST_ERROR_PATTERN.source.endsWith("$")).toBe(true);
    expect(LAST_ERROR_PATTERN.test("timeout and more")).toBe(false);
  });
  it("F5-07 all three intake fields together pass; any one alone fails", () => {
    const all = { ...source, lastError: "http-500", lastErrorAt: "2026-10-06T10:00:00Z", consecutiveFailures: 2 };
    expect(sourceSchema.safeParse(all).success).toBe(true);
    expect(sourceSchema.safeParse({ ...source, lastError: "http-500" }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...all, consecutiveFailures: 0 }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...all, lastErrorAt: "2026-10-06" }).success).toBe(false);
  });
});

describe("F5-03 feedType and feedUrl", () => {
  it("F5-03 rss/atom need a feedUrl; none/page/newsletter must not have one; api may", () => {
    expect(sourceSchema.safeParse(source).success).toBe(true);
    const noFeed: Record<string, unknown> = { ...source };
    delete noFeed.feedUrl;
    expect(sourceSchema.safeParse({ ...noFeed, feedType: "atom" }).success).toBe(false);
    for (const t of ["none", "page", "newsletter"])
      expect(sourceSchema.safeParse({ ...source, feedType: t }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...source, feedType: "api" }).success).toBe(true);
    expect(sourceSchema.safeParse({ ...noFeed, feedType: "api" }).success).toBe(true);
  });
});

describe("F5-49 registry URL shape", () => {
  const at = String.fromCharCode(64);
  it.each([
    "https://192.0.2.10/feed",
    "https://3221225994/feed",
    "https://0300.0000.0002.0012/feed",
    "https://0xC000020A/feed",
    "https://[2001:db8::1]/feed",
    `https://user${at}feeds.fixture-source.test/feed`,
    "https://feeds.fixture-source.test:8443/rss",
    "http://feeds.fixture-source.test/rss",
  ])("F5-49 %s is refused as feedUrl and website", (u) => {
    expect(sourceSchema.safeParse({ ...source, feedUrl: u }).success).toBe(false);
    expect(sourceSchema.safeParse({ ...source, website: u }).success).toBe(false);
  });
  it("F5-49 an explicit :443 is allowed", () => {
    expect(sourceSchema.safeParse({ ...source, feedUrl: "https://feeds.fixture-source.test:443/rss" }).success).toBe(
      true,
    );
  });
});

describe("F5-10 item text rules", () => {
  it.each([
    ["blank title", { title: "  " }],
    ["NUL", { title: "a\u0000b" }],
    ["tab", { title: "a\tb" }],
    ["C1 control", { excerpt: "a\u0085b" }],
    ["not NFC", { title: "e\u0301" }],
    ["javascript: url", { url: "javascript:alert(1)" }],
    ["2,049-character url", { url: `https://www.example.org/${"a".repeat(2049 - 24)}` }],
  ])("F5-10 %s fails", (_n, patch) => {
    expect(sourceItemSchema.safeParse({ ...item, ...patch }).success).toBe(false);
  });
  it("F5-10 a 2,048-character url passes", () => {
    const url = `https://www.example.org/${"a".repeat(2048 - 24)}`;
    expect(url).toHaveLength(2048);
    expect(sourceItemSchema.safeParse({ ...item, url }).success).toBe(true);
  });
});
