import { describe, expect, it } from "vitest";
import {
  countScriptCloseTags,
  countScriptOpenTags,
  countTags,
  firstTagIndex,
  isJsonLdScriptAttrs,
  nonJsonLdScriptTags,
  parseAttributes,
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

  it("F3-38 a JSON-LD script is recognised only by its own type attribute", () => {
    for (const ok of [
      ' type="application/ld+json"',
      " TYPE='application/ld+json'",
      " type=application/ld+json",
      ' id="x" type="application/ld+json"',
    ])
      expect(isJsonLdScriptAttrs(ok), ok).toBe(true);
    for (const bad of [
      "",
      ' type="text/javascript"',
      ` data-x='type="application/ld+json"'`,
      ` data-x='a type="application/ld+json"'`,
      ' type="application/ld+json" type="module"',
      ' xtype="application/ld+json"',
    ])
      expect(isJsonLdScriptAttrs(bad), bad).toBe(false);
    expect(parseAttributes(` data-x='type="y"' id=z`)).toEqual([
      ["data-x", 'type="y"'],
      ["id", "z"],
    ]);
  });

  it("F3-38 non-JSON-LD script tags are found in any case", () => {
    expect(
      nonJsonLdScriptTags('<SCRIPT>a</SCRIPT><Script type="application/ld+json">{}</script><script src=x.js></script>'),
    ).toEqual(["<SCRIPT>", "<script src=x.js>"]);
  });

  it("rejects tag names that would inject into the pattern", () => {
    expect(() => countTags("", "a|b")).toThrow();
  });
});
