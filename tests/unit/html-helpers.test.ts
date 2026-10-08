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
  scriptStartTags,
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
    for (const ok of [' type="application/ld+json"', " TYPE='application/ld+json'", " type=application/ld+json"])
      expect(isJsonLdScriptAttrs(ok), ok).toBe(true);
    for (const bad of [
      "",
      ' type="text/javascript"',
      ` data-x='type="application/ld+json"'`,
      ` data-x='a type="application/ld+json"'`,
      ' type="application/ld+json" type="module"',
      ' xtype="application/ld+json"',
      ' id="x" type="application/ld+json"',
    ])
      expect(isJsonLdScriptAttrs(bad), bad).toBe(false);
    expect(parseAttributes(` data-x='type="y"' id=z`)).toEqual([
      ["data-x", 'type="y"'],
      ["id", "z"],
    ]);
  });

  it("V1-AegisLow a JSON-LD script may carry only the type attribute (src and onload fixtures fail)", () => {
    for (const bad of [
      ' type="application/ld+json" src="https://example.invalid/x.js"',
      ' src="x.js" type="application/ld+json"',
      ' type="application/ld+json" onload="alert(1)"',
      " ONLOAD=alert(1) type=application/ld+json",
      ' type="application/ld+json" async',
      ' type="application/ld+json" is:inline',
    ])
      expect(isJsonLdScriptAttrs(bad), bad).toBe(false);
    expect(isJsonLdScriptAttrs(' type="application/ld+json" /')).toBe(true);
    expect(nonJsonLdScriptTags('<script type="application/ld+json" src="x.js">{}</script>')).toHaveLength(1);
    expect(nonJsonLdScriptTags('<script type="application/ld+json" onload="x()">{}</script>')).toHaveLength(1);
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

describe("V1-55 scriptStartTags (tokenizer-style, not a regex)", () => {
  it("finds real script start tags, with their attributes", () => {
    expect(scriptStartTags('<p>a</p><script type="application/ld+json">{}</script><script>x()</script>')).toEqual([
      ' type="application/ld+json"',
      "",
    ]);
  });
  it("ignores <script> inside a quoted attribute value or a comment", () => {
    expect(
      scriptStartTags(
        `<div aria-label="Data table: <script>alert(1)</script>"></div><a title='<script>'>x</a><!-- <script>c</script> -->`,
      ),
    ).toEqual([]);
  });
  it("skips a script's body, so '<script>' text inside it isn't a second tag", () => {
    expect(scriptStartTags('<script>var s = "<script>";</script>')).toEqual([""]);
  });
  it("still catches an injected tag after an attribute value closes", () => {
    expect(scriptStartTags('<div title="x"><script>alert(1)</script></div>')).toEqual([""]);
    expect(scriptStartTags("<SCRIPT SRC=x></SCRIPT>")).toEqual([" SRC=x"]);
  });
});
