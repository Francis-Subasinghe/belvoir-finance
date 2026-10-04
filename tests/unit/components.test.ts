/**
 * F2 component render tests (Astro container API): F2-22 to F2-25, F2-28.
 * Rendered HTML is parsed with the shared helpers where tags are matched.
 */
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, it } from "vitest";
import ArticleHeader from "../../src/components/ArticleHeader.astro";
import ChartWrapper from "../../src/components/ChartWrapper.astro";
import SiteNav from "../../src/components/SiteNav.astro";
import SourceNote from "../../src/components/SourceNote.astro";
import StatusNotice from "../../src/components/StatusNotice.astro";
import StoryCard from "../../src/components/StoryCard.astro";
import Callout from "../../src/components/markdoc/Callout.astro";
import Button from "../../src/components/forms/Button.astro";
import TextField from "../../src/components/forms/TextField.astro";
import CheckboxField from "../../src/components/forms/CheckboxField.astro";
import SelectField from "../../src/components/forms/SelectField.astro";
import { CALLOUT_TYPES } from "../../src/lib/markdoc-allowlist";
import { countTags, tagAttributes } from "../helpers/html";

let container: AstroContainer;
beforeAll(async () => {
  container = await AstroContainer.create();
});
const day = new Date("2026-10-02T00:00:00Z");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const render = (c: any, props: Record<string, unknown>, slots?: Record<string, string>) =>
  container.renderToString(c, { props, ...(slots ? { slots } : {}) });

const card = {
  title: "T",
  href: "/belvoir-finance/stories/t/",
  summary: "S",
  format: "how-to",
  level: "beginner",
  date: day,
};

describe("F2-22 story card", () => {
  it.each([2, 3, 4])("title heading level is the prop (h%i)", async (level) => {
    const html = await render(StoryCard, { ...card, headingLevel: level });
    expect(countTags(html, `h${level}`)).toBe(1);
    for (const other of [1, 2, 3, 4].filter((l) => l !== level)) expect(countTags(html, `h${other}`)).toBe(0);
  });
  it("shows summary, format and level as text, and the date in <time datetime>", async () => {
    const html = await render(StoryCard, card);
    expect(html).toContain("S");
    expect(html).toMatch(/<dt>Format<\/dt>\s*<dd>How to<\/dd>/);
    expect(html).toMatch(/<dt>Level<\/dt>\s*<dd>Beginner<\/dd>/);
    expect(html).toMatch(/<time datetime="2026-10-02"[^>]*>2 October 2026<\/time>/);
  });
  it("the title link is the only interactive element", async () => {
    const html = await render(StoryCard, { ...card, demo: true });
    expect(countTags(html, "a")).toBe(1);
    for (const t of ["button", "input", "select", "textarea"]) expect(countTags(html, t)).toBe(0);
  });
  it("a demo story says so in visible text; a non-demo one doesn't", async () => {
    expect(await render(StoryCard, { ...card, demo: true })).toContain("Demo content");
    expect(await render(StoryCard, card)).not.toContain("Demo content");
  });
});

describe("F2-23 article header", () => {
  const base = { title: "Title", summary: "Summary.", author: "Placeholder Author", firstPublished: day };

  it("renders one h1, the summary and the author", async () => {
    const html = await render(ArticleHeader, base);
    expect(countTags(html, "h1")).toBe(1);
    expect(html).toContain("Summary.");
    expect(html).toContain("Placeholder Author");
  });
  it('"Reviewed by" appears only when a reviewer is passed', async () => {
    expect(await render(ArticleHeader, base)).not.toContain("Reviewed by");
    const html = await render(ArticleHeader, { ...base, reviewer: "Placeholder Reviewer" });
    expect(html).toMatch(/Reviewed by<\/dt>\s*<dd>Placeholder Reviewer<\/dd>/);
  });
  it("dates are en-GB in <time datetime>", async () => {
    const html = await render(ArticleHeader, { ...base, lastReviewed: new Date("2026-01-09T00:00:00Z") });
    expect(html).toMatch(/<time datetime="2026-10-02"[^>]*>2 October 2026<\/time>/);
    expect(html).toMatch(/<time datetime="2026-01-09"[^>]*>9 January 2026<\/time>/);
  });
  it("shows the period when given", async () => {
    expect(await render(ArticleHeader, { ...base, period: "2025 to 2026 tax year" })).toContain(
      "2025 to 2026 tax year",
    );
  });
  it("shows a jurisdiction label only when the jurisdiction isn't UK", async () => {
    expect(await render(ArticleHeader, { ...base, jurisdiction: "UK" })).not.toContain("jurisdiction-label");
    expect(await render(ArticleHeader, { ...base, jurisdiction: "IE" })).toMatch(/Jurisdiction: Ireland/);
    expect(await render(ArticleHeader, { ...base, jurisdiction: "other" })).toMatch(/Jurisdiction: Other jurisdiction/);
  });
  it("is not a <header> (no second banner landmark)", async () => {
    expect(countTags(await render(ArticleHeader, base), "header")).toBe(0);
  });
});

describe("F2-24 source note", () => {
  const props = { name: "Example statistics", publisher: "Publisher", url: "https://example.org/x", accessed: day };

  it("links the source name over https with rel=noopener noreferrer, plus publisher and accessed date", async () => {
    const html = await render(SourceNote, props);
    const [a] = tagAttributes(html, "a");
    expect(a).toContain('href="https://example.org/x"');
    expect(a).toContain('rel="noopener noreferrer"');
    expect(html).toMatch(/>\s*Example statistics\s*<\/a>/);
    expect(html).toContain("Publisher");
    expect(html).toMatch(/<time datetime="2026-10-02"/);
    expect(html).not.toMatch(/click here/i);
  });
  it.each(["http://example.org/", "javascript:alert(1)", "//evil.example/", "data:text/html,x"])(
    "negative fixture: %s renders no link",
    async (url) => {
      const html = await render(SourceNote, { ...props, url });
      expect(countTags(html, "a")).toBe(0);
      expect(html).toContain("Example statistics");
      expect(html).not.toContain(url);
    },
  );
});

describe("F2-25 callouts", () => {
  it("the allowlist holds exactly the four types", () => {
    expect([...CALLOUT_TYPES].sort()).toEqual(["estimate", "example", "fact", "opinion"]);
  });
  it.each([
    ["fact", "Fact"],
    ["estimate", "Estimate"],
    ["example", "Example"],
    ["opinion", "Opinion"],
  ])("%s renders an <aside> named by its type, with a visible label", async (type, label) => {
    const html = await render(Callout, { type }, { default: "<p>Body</p>" });
    expect(html).toMatch(new RegExp(`<aside[^>]*aria-label="${label}"`));
    expect(html).toMatch(new RegExp(`<span class="callout-type">${label}</span>`));
    const titled = await render(Callout, { type, title: "My title" }, { default: "<p>Body</p>" });
    expect(titled).toMatch(new RegExp(`<aside[^>]*aria-label="${label}: My title"`));
    expect(titled).toContain("My title");
  });
});

describe("F2-28 status notice", () => {
  it.each([
    ["info", "Information"],
    ["success", "Success"],
    ["warning", "Warning"],
    ["error", "Error"],
  ])("%s has a visible label and no live role when static", async (variant, label) => {
    const html = await render(StatusNotice, { variant }, { default: "<p>Body</p>" });
    expect(html).toContain(`<span class="status-kind">${label}</span>`);
    expect(html).not.toMatch(/role="(status|alert)"/);
  });
  it("live notices use role=status, or role=alert for errors", async () => {
    expect(await render(StatusNotice, { variant: "info", live: true })).toContain('role="status"');
    expect(await render(StatusNotice, { variant: "error", live: true })).toContain('role="alert"');
  });
});

describe("F2-20 navigation", () => {
  const items = [
    { href: "/belvoir-finance/", label: "Home" },
    { href: "/belvoir-finance/stories/", label: "Stories" },
  ];
  it("labels the nav Main and marks only the current link", async () => {
    const html = await render(SiteNav, { items, current: "/belvoir-finance/stories/" });
    expect(html).toMatch(/<nav[^>]*aria-label="Main"/);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/href="\/belvoir-finance\/stories\/" aria-current="page"/);
  });
  it("has no Work with Belvoir link (D4)", async () => {
    expect(await render(SiteNav, { items, current: "/" })).not.toMatch(/work with belvoir/i);
  });
});

describe("F2-26 chart wrapper", () => {
  const props = {
    title: "Chart",
    units: "pounds",
    source: "Placeholder",
    categories: ["Q1", "Q2"],
    series: [
      { name: "Profit", values: [1000, 2000] },
      { name: "Cash", values: [500, 2500] },
    ],
  };
  it("is a figure with a caption (title, units, source) and a data table", async () => {
    const html = await render(ChartWrapper, props);
    expect(countTags(html, "figure")).toBe(1);
    expect(html).toMatch(/<figcaption[\s\S]*Chart[\s\S]*Units: pounds[\s\S]*Source: Placeholder[\s\S]*<\/figcaption>/);
    expect(countTags(html, "table")).toBe(1);
    expect(html).toMatch(/<td class="numeric" data-numeric[^>]*>\s*2,500\s*<\/td>/);
  });
  it("the SVG is aria-hidden, has no style attribute and no literal colours", async () => {
    const html = await render(ChartWrapper, props);
    for (const attrs of tagAttributes(html, "svg")) expect(attrs).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/\sstyle=/);
    expect(html).not.toMatch(/\s(fill|stroke)="#/);
  });
  it("the table is in a focusable, named scroll region", async () => {
    const html = await render(ChartWrapper, props);
    expect(html).toMatch(/<div class="table-scroll" tabindex="0" role="region" aria-label="Data table: Chart">/);
  });
  it("series differ by more than colour (solid vs outlined, direct value labels)", async () => {
    const html = await render(ChartWrapper, props);
    expect(html).toContain("chart-series-1");
    expect(html).toContain("chart-series-2-outline");
    expect(html).toMatch(/<text class="chart-value numeric" data-numeric[^>]*>\s*2,500\s*<\/text>/);
  });
});

describe("F2-27 form controls", () => {
  it("text field: label, hint and error linked; aria-invalid; Error: prefix; required in text", async () => {
    const html = await render(TextField, {
      id: "e",
      label: "Email",
      type: "email",
      hint: "H",
      error: "Bad",
      required: true,
    });
    expect(html).toMatch(/<label for="e">/);
    expect(html).toContain("(required)");
    expect(html).toMatch(/<p id="e-hint"/);
    expect(html).toMatch(/<p id="e-error" class="field-error">\s*<strong>Error:<\/strong> Bad/);
    const [input] = tagAttributes(html, "input");
    expect(input).toContain('aria-describedby="e-hint e-error"');
    expect(input).toContain('aria-invalid="true"');
    expect(input).toContain('type="email"');
  });
  it("number input is tabular", async () => {
    const [input] = tagAttributes(await render(TextField, { id: "n", label: "N", type: "number" }), "input");
    expect(input).toMatch(/class="[^"]*numeric/);
  });
  it("select and checkbox have labels and describedby", async () => {
    const sel = await render(SelectField, { id: "s", label: "S", options: [{ value: "a", label: "A" }], error: "E" });
    expect(sel).toMatch(/<label for="s">/);
    expect(tagAttributes(sel, "select")[0]).toContain('aria-describedby="s-error"');
    const cb = await render(CheckboxField, { id: "c", label: "C", hint: "H" });
    expect(cb).toMatch(/<label for="c">/);
    expect(tagAttributes(cb, "input")[0]).toContain('aria-describedby="c-hint"');
  });
  it("buttons are <button> with an explicit type", async () => {
    const html = await render(Button, { type: "button", variant: "secondary" }, { default: "Go" });
    expect(tagAttributes(html, "button")[0]).toContain('type="button"');
  });
});
