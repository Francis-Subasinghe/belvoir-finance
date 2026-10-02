import { describe, expect, it } from "vitest";
import { EXTERNAL_REL, toSafeLink } from "../../src/lib/links";

describe("toSafeLink (ADR-0001 req. 2)", () => {
  it("passes internal links through unchanged", () => {
    for (const href of ["/stories/", "../about/", "#main", "stories/x/"]) {
      expect(toSafeLink(href)).toEqual({ ok: true, href, external: false });
    }
  });

  it("marks https links external with rel=noopener noreferrer", () => {
    const res = toSafeLink("https://www.example.org/a?b=1");
    expect(res).toMatchObject({ ok: true, external: true, rel: EXTERNAL_REL });
    expect(EXTERNAL_REL).toBe("noopener noreferrer");
  });

  it.each([
    "http://www.example.org/",
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    " javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox",
    "mailto:someone@example.invalid",
    "//evil.example/",
    "\\\\evil.example/",
    "https://user:pass@example.org/",
    "",
  ])("refuses %j", (href) => {
    expect(toSafeLink(href).ok).toBe(false);
  });

  it("refuses missing hrefs", () => {
    expect(toSafeLink(undefined).ok).toBe(false);
    expect(toSafeLink(null).ok).toBe(false);
  });
});
