/**
 * The HTML text helpers behind the F4 dist checks (tests/helpers/f4-dist.ts).
 * CodeQL js/double-escaping: `&amp;` must be decoded last, or an escaped
 * entity is decoded twice.
 */
import { describe, expect, it } from "vitest";
import { decodeEntities, text } from "../helpers/f4-dist";

describe("F4-06 f4-dist text helpers decode each entity once", () => {
  it("F4-06 &amp;#39; decodes to the literal &#39;, not an apostrophe", () => {
    expect(decodeEntities("&amp;#39;")).toBe("&#39;");
    expect(decodeEntities("&amp;quot;")).toBe("&quot;");
    expect(decodeEntities("&amp;amp;")).toBe("&amp;");
    expect(text("<p>it&amp;#39;s</p>")).toBe("it&#39;s");
  });
  it("F4-06 / F4-15 an inline .money span adds no space, as textContent", () => {
    expect(
      text('<p>cash rises by <span class="money">£5,000</span>. Lowest at <span class="money">-£5,000</span> in</p>'),
    ).toBe("cash rises by £5,000. Lowest at -£5,000 in");
  });
  it("F4-06 the plain entities still decode", () => {
    expect(decodeEntities("Don&#39;t &quot;guess&quot; &amp; check")).toBe(`Don't "guess" & check`);
    expect(text("<p>Profit &amp; cash</p>")).toBe("Profit & cash");
  });
});
