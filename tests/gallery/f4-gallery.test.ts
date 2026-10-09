/**
 * F4-58 / F4-46 on the gallery build (dist-gallery/): the explorer variants
 * exist (default, every error code, JavaScript off, a negative result), the
 * gallery pages load no JavaScript, and the only script in the whole gallery
 * build is the tool page's module (the same rule as dist/).
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { errorMessage, FIELDS } from "../../src/lib/cash-vs-profit/copy";
import { requireBuild } from "../helpers/built-site";
import { scriptPolicyProblems, text } from "../helpers/f4-dist";

const DIR = "dist-gallery";
let files: string[] = [];
let pages: { page: string; html: string }[] = [];
const gallery = () => pages.find((p) => p.page === "design/index.html")?.html ?? "";

beforeAll(() => {
  files = requireBuild(DIR).map((f) => relative(DIR, f).replace(/\\/g, "/"));
  pages = files
    .filter((f) => f.endsWith(".html"))
    .map((page) => ({ page, html: readFileSync(`${DIR}/${page}`, "utf8") }));
});

describe("F4-58 gallery explorer variants", () => {
  it("F4-58 default, two error sets, JavaScript off and a negative result", () => {
    for (const id of ["default", "errors-a", "errors-b", "nojs", "negative"]) {
      expect(gallery(), id).toContain(`data-testid="explorer-${id}"`);
    }
  });

  it("F4-58 every error code's message is shown, with the Error: prefix", () => {
    const html = gallery();
    const label = (id: string) => FIELDS.find((f) => f.id === id)?.label ?? "";
    const shown = [
      errorMessage("money", "blank", label("sales")),
      errorMessage("money", "negative", label("costs")),
      errorMessage("days", "notWhole", label("customerDays")),
      errorMessage("days", "daysRange", label("supplierDays")),
      errorMessage("money", "invalid", label("opening")),
      errorMessage("money", "decimals", label("sales")),
      errorMessage("money", "overMax", label("costs")),
      errorMessage("days", "invalid", label("customerDays")),
      errorMessage("days", "blank", label("supplierDays")),
    ];
    for (const m of shown)
      expect(html, m).toContain(`<span class="field-error-text">${m.replace(/'/g, "&#39;")}</span>`);
    expect(html).toContain("Results not updated. 5 answers need fixing.");
  });

  it("F4-58 the JavaScript-off copy is disabled and the negative result shows -£ figures", () => {
    const html = gallery();
    const nojs = html.slice(html.indexOf('data-testid="explorer-nojs"'));
    expect(nojs).toMatch(/<fieldset class="explorer-fields" disabled/);
    expect(text(html)).toContain("profit is -£12,000 but cash falls by £10,000");
    // F4-15: each amount is one .money unit in the server render too.
    expect(html).toContain(
      'profit is <span class="money">-£12,000</span> but cash falls by <span class="money">£10,000</span>',
    );
  });

  it("F4-46 / F2-35 the gallery build loads no script except on the tool page, and the gallery copies have no live region", () => {
    expect(
      scriptPolicyProblems(
        pages,
        files.filter((f) => /\.m?js$/.test(f)),
      ),
    ).toEqual([]);
    expect(gallery()).not.toContain('role="status"');
  });
});
