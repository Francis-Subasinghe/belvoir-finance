import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import JsonLd from "../../src/components/JsonLd.astro";
import { serializeJsonLd } from "../../src/lib/jsonld";

const HOSTILE = "Cash </script><script>alert(1)</script> & <b>more</b>";

describe("F1-31 serializeJsonLd", () => {
  it("escapes <, > and & as \\u003c, \\u003e and \\u0026", () => {
    const out = serializeJsonLd({ headline: HOSTILE });
    expect(out).not.toMatch(/[<>&]/);
    expect(out).toContain("\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u003c/script\\u003e");
    expect(out).toContain("\\u0026");
  });

  it("round-trips to the original data", () => {
    const data = { "@type": "Article", headline: HOSTILE, sep: "a\u2028b\u2029c" };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });

  it("rejects values JSON cannot serialise", () => {
    expect(() => serializeJsonLd(undefined)).toThrow(TypeError);
  });
});

describe("F1-31 <JsonLd> component", () => {
  it("renders a hostile title as inert text inside exactly one ld+json block", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(JsonLd, { props: { data: { headline: HOSTILE } } });
    expect(html.match(/<script\b/gi)).toHaveLength(1);
    expect(html.match(/<\/script>/gi)).toHaveLength(1);
    expect(html).toMatch(/^<script type="application\/ld\+json">/);
    const inner = html.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, "");
    expect(JSON.parse(inner)).toEqual({ headline: HOSTILE });
  });
});
