import { describe, expect, it } from "vitest";
import {
  countScriptCloseTags,
  countScriptOpenTags,
  countTags,
  firstTagIndex,
  scriptBlocks,
  tagAttributes,
} from "../helpers/html";

describe("test HTML helpers (CodeQL js/bad-tag-filter)", () => {
  it("matches script blocks regardless of case, whitespace or attributes in the end tag", () => {
    const html = '<SCRIPT type="a">one</script ><script>two</SCRIPT\t\n><Script src="x.js"></script foo="bar">';
    expect(scriptBlocks(html)).toEqual([
      { attrs: ' type="a"', body: "one" },
      { attrs: "", body: "two" },
      { attrs: ' src="x.js"', body: "" },
    ]);
    expect(countScriptOpenTags(html)).toBe(3);
    expect(countScriptCloseTags(html)).toBe(3);
  });

  it("counts and locates other tags case-insensitively", () => {
    const html = "<p>x</p><H1>a</H1><style>b</style>";
    expect(countTags(html, "h1")).toBe(1);
    expect(firstTagIndex(html, "STYLE")).toBe(html.indexOf("<style"));
    expect(tagAttributes('<A href="x">y</a><a  rel="z">', "a")).toEqual([' href="x"', '  rel="z"']);
  });

  it("rejects tag names that would inject into the pattern", () => {
    expect(() => countTags("", "a|b")).toThrow();
  });
});
