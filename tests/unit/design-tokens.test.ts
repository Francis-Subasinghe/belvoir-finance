import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../src/lib/contrast";
import { readSources, scanGold } from "../helpers/design-scan";

const tokensCss = readFileSync("src/styles/tokens.css", "utf8");
const token = (name: string): string => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokensCss);
  if (!m?.[1]) throw new Error(`token --${name} not found`);
  return m[1].toLowerCase();
};

describe("F1-22 brand tokens", () => {
  it.each([
    ["color-navy", "#0b132b"],
    ["color-slate", "#1c2541"],
    ["color-gold", "#c5a059"],
    ["color-gold-on-light", "#7e6026"],
    ["color-alabaster", "#f8fafc"],
    ["color-white", "#ffffff"],
  ])("--%s is %s", (name, hex) => {
    expect(token(name)).toBe(hex);
  });

  it("F1-23 defines serif, sans and mono/tabular numeral tokens", () => {
    expect(tokensCss).toMatch(/--font-serif:.*serif/);
    expect(tokensCss).toMatch(/--font-sans:.*sans-serif/);
    expect(tokensCss).toMatch(/--font-mono:.*monospace/);
    expect(tokensCss).toMatch(/--numeric:\s*tabular-nums/);
  });
});

// [label, foreground token, background token, minimum ratio]. Must match the
// "Pairs in use" table in docs/design/CONTRAST.md row for row (F2-11).
const PAIRS: [string, string, string, number][] = [
  ["Body text on white", "color-text", "color-white", 4.5],
  ["Body text on alabaster", "color-text", "color-alabaster", 4.5],
  ["Body text on hover background", "color-text", "color-hover-bg", 4.5],
  ["Body text on info notice", "color-text", "color-status-info-bg", 4.5],
  ["Body text on success notice", "color-text", "color-status-success-bg", 4.5],
  ["Body text on warning notice", "color-text", "color-status-warning-bg", 4.5],
  ["Body text on error notice", "color-text", "color-status-error-bg", 4.5],
  ["Muted text on white", "color-text-muted", "color-white", 4.5],
  ["Muted text on alabaster", "color-text-muted", "color-alabaster", 4.5],
  ["Headings (navy) on white", "color-navy", "color-white", 4.5],
  ["Headings (navy) on alabaster", "color-navy", "color-alabaster", 4.5],
  ["Navy on hover background", "color-navy", "color-hover-bg", 4.5],
  ["Gold-on-light on white", "color-gold-on-light", "color-white", 4.5],
  ["Gold-on-light on alabaster", "color-gold-on-light", "color-alabaster", 4.5],
  ["Gold-on-light on notice background", "color-gold-on-light", "color-notice-bg", 4.5],
  ["Gold-on-light on hover background", "color-gold-on-light", "color-hover-bg", 4.5],
  ["Gold-on-light on info notice", "color-gold-on-light", "color-status-info-bg", 4.5],
  ["Gold-on-light on success notice", "color-gold-on-light", "color-status-success-bg", 4.5],
  ["Gold-on-light on error notice", "color-gold-on-light", "color-status-error-bg", 4.5],
  ["Gold on navy", "color-gold", "color-navy", 4.5],
  ["Gold on slate", "color-gold", "color-slate", 4.5],
  ["Text on navy", "color-text-on-dark", "color-navy", 4.5],
  ["Text on slate", "color-text-on-dark", "color-slate", 4.5],
  ["Notice text on notice background", "color-notice-text", "color-notice-bg", 4.5],
  ["Primary button text", "color-button-primary-text", "color-button-primary-bg", 4.5],
  ["Primary button text on hover", "color-button-primary-text", "color-button-primary-hover-bg", 4.5],
  ["Disabled text on disabled background", "color-disabled-text", "color-disabled-bg", 4.5],
  ["Error text on white", "color-error", "color-white", 4.5],
  ["Error text on alabaster", "color-error", "color-alabaster", 4.5],
  ["Info label on info background", "color-status-info-accent", "color-status-info-bg", 4.5],
  ["Success label on success background", "color-status-success-accent", "color-status-success-bg", 4.5],
  ["Warning label on warning background", "color-status-warning-accent", "color-status-warning-bg", 4.5],
  ["Error label on error background", "color-status-error-accent", "color-status-error-bg", 4.5],
  ["Fact label on white", "color-callout-fact", "color-white", 4.5],
  ["Estimate label on white", "color-callout-estimate", "color-white", 4.5],
  ["Example label on white", "color-callout-example", "color-white", 4.5],
  ["Opinion label on white", "color-callout-opinion", "color-white", 4.5],
  ["Chart text on chart background", "color-text", "color-chart-bg", 4.5],
  ["Chart series 1 on chart background", "color-chart-series-1", "color-chart-bg", 3],
  ["Chart series 2 on chart background", "color-chart-series-2", "color-chart-bg", 3],
  ["Chart axis on chart background", "color-chart-axis", "color-chart-bg", 3],
  ["Strong border on white", "color-border-strong", "color-white", 3],
  ["Strong border on alabaster", "color-border-strong", "color-alabaster", 3],
  ["Strong border on hover background", "color-border-strong", "color-hover-bg", 3],
  ["Error border on white", "color-error", "color-white", 3],
  ["Primary button boundary on white", "color-button-primary-bg", "color-white", 3],
  ["Primary button boundary on alabaster", "color-button-primary-bg", "color-alabaster", 3],
  ["Focus ring on white", "color-focus", "color-white", 3],
  ["Focus ring on alabaster", "color-focus", "color-alabaster", 3],
  ["Focus ring on notice background", "color-focus", "color-notice-bg", 3],
  ["Focus ring on navy", "color-focus-on-dark", "color-navy", 3],
  ["Focus ring on slate", "color-focus-on-dark", "color-slate", 3],
];

describe("F1-24 / F1-25 contrast", () => {
  it.each(PAIRS)("%s meets its minimum", (_label, fg, bg, min) => {
    expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(min);
  });

  it("gold-on-light measures 5.85:1 on white and 5.59:1 on alabaster", () => {
    expect(contrastRatio("#7e6026", "#ffffff").toFixed(2)).toBe("5.85");
    expect(contrastRatio("#7e6026", "#f8fafc").toFixed(2)).toBe("5.59");
    expect(contrastRatio("#7e6026", "#fff8e6").toFixed(2)).toBe("5.52");
  });

  it("brand gold fails on light surfaces (why the rule exists)", () => {
    expect(contrastRatio("#c5a059", "#ffffff")).toBeLessThan(4.5);
    expect(contrastRatio("#c5a059", "#f8fafc")).toBeLessThan(4.5);
  });
});

interface ContrastRow {
  label: string;
  fg: string;
  bg: string;
  ratio: string;
  min: number;
}

/** Parse the "Pairs in use" table in CONTRAST.md. */
function contrastRows(): ContrastRow[] {
  const md = readFileSync("docs/design/CONTRAST.md", "utf8");
  const section = md.split(/^## Pairs in use$/m)[1]?.split(/^## /m)[0] ?? "";
  return section
    .split("\n")
    .filter((l) => /^\| .*`--color-/.test(l))
    .map((l) => {
      const cells = l.split("|").map((c) => c.trim());
      const tokenOf = (cell: string) => /`--([\w-]+)`/.exec(cell)?.[1] ?? "";
      return {
        label: cells[1] ?? "",
        fg: tokenOf(cells[2] ?? ""),
        bg: tokenOf(cells[3] ?? ""),
        ratio: (cells[4] ?? "").replace(":1", ""),
        min: Number(cells[5]),
      };
    });
}

describe("F2-10 / F2-11 CONTRAST.md and PAIRS can't drift", () => {
  const rows = contrastRows();

  it("the table is parsed (not vacuous)", () => {
    expect(rows.length).toBeGreaterThanOrEqual(40);
  });

  it("every CONTRAST.md row has a PAIRS entry, and every PAIRS entry has a row", () => {
    const key = (l: string, f: string, b: string, m: number) => `${l}|${f}|${b}|${m}`;
    const fromDoc = rows.map((r) => key(r.label, r.fg, r.bg, r.min)).sort();
    const fromTest = PAIRS.map(([l, f, b, m]) => key(l, f, b, m)).sort();
    expect(fromDoc).toEqual(fromTest);
  });

  it.each(rows.map((r) => [r.label, r] as const))("%s: measured ratio matches the table to 2 dp", (_l, r) => {
    expect(contrastRatio(token(r.fg), token(r.bg)).toFixed(2)).toBe(r.ratio);
    expect(Number(r.ratio)).toBeGreaterThanOrEqual(r.min);
  });

  it("covers every callout type, status variant, form state and chart series token", () => {
    const used = new Set(PAIRS.flatMap(([, f, b]) => [f, b]));
    for (const t of [
      "color-callout-fact",
      "color-callout-estimate",
      "color-callout-example",
      "color-callout-opinion",
      "color-status-info-accent",
      "color-status-success-accent",
      "color-status-warning-accent",
      "color-status-error-accent",
      "color-error",
      "color-disabled-text",
      "color-hover-bg",
      "color-chart-series-1",
      "color-chart-series-2",
      "color-chart-axis",
    ]) {
      expect(used.has(t), t).toBe(true);
    }
  });
});

describe("F2-12 perceivable UI boundaries use a 3:1 token", () => {
  it("inputs and selects use --color-border-strong, invalid ones --color-error", () => {
    const css = readFileSync("src/styles/components.css", "utf8");
    expect(css).toMatch(/\.input \{[^}]*border: var\(--border-width-strong\) solid var\(--color-border-strong\);/);
    expect(css).toMatch(/\.input\[aria-invalid="true"\] \{[^}]*border-color: var\(--color-error\);/);
  });
  it.each([
    ["color-border-strong", "color-white"],
    ["color-border-strong", "color-alabaster"],
    ["color-border-strong", "color-hover-bg"],
    ["color-error", "color-white"],
    ["color-button-primary-bg", "color-white"],
  ])("%s on %s is at least 3:1", (fg, bg) => {
    expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(3);
  });
  it("--color-border is decorative only (1.48:1) and is never an input boundary", () => {
    expect(contrastRatio(token("color-border"), token("color-white")).toFixed(2)).toBe("1.48");
    const css = readFileSync("src/styles/components.css", "utf8");
    for (const sel of [".input", ".checkbox", ".button"]) {
      const block = new RegExp(`\\${sel} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";
      expect(block, sel).not.toContain("--color-border)");
    }
  });
});

describe("F1-24 gold is only used on navy or slate", () => {
  // F1's regex scan is replaced by the PostCSS scanner in tests/unit/design-system.test.ts (F2-06),
  // which also covers nested rules, @media, :is() and aliases. This keeps the F1 test name.
  it("the PostCSS gold scan over src/ finds nothing", () => {
    expect(scanGold(readSources("src"))).toEqual([]);
  });
});

describe("ADR-0002 is the source of the palette and fonts", () => {
  const adr = readFileSync("docs/decisions/ADR-0002-brand-colour-type.md", "utf8");

  it.each([
    ["Navy", "color-navy"],
    ["Slate", "color-slate"],
    ["Gold", "color-gold"],
    ["Gold on light", "color-gold-on-light"],
    ["Alabaster", "color-alabaster"],
    ["White", "color-white"],
  ])("palette row %s matches --%s", (row, name) => {
    const m = new RegExp(`^\\| ${row} \\| \`(#[0-9A-Fa-f]{6})\``, "m").exec(adr);
    expect(m?.[1], `ADR-0002 row ${row}`).toBeDefined();
    expect(token(name)).toBe(m?.[1]?.toLowerCase());
  });

  it("the @fontsource imports are exactly ADR-0002's families and weights", () => {
    const css = readFileSync("src/styles/global.css", "utf8");
    const imports = [...css.matchAll(/@import "@fontsource\/([\w-]+)\/latin-(\d+)\.css";/g)].map(
      (m) => `${m[1]} ${m[2]}`,
    );
    expect(imports.sort()).toEqual(
      ["source-serif-4 600", "source-serif-4 700", "inter 400", "inter 600", "ibm-plex-mono 400"].sort(),
    );
    expect(adr).toMatch(/Source Serif 4 \(600, 700\)/);
    expect(adr).toMatch(/Inter \(400, 600\)/);
    expect(adr).toMatch(/IBM Plex Mono \(400\)/);
    expect(tokensCss).toMatch(/--font-serif: "Source Serif 4"/);
    expect(tokensCss).toMatch(/--font-sans: "Inter"/);
    expect(tokensCss).toMatch(/--font-mono: "IBM Plex Mono"/);
  });

  it("the design docs cite ADR-0002 as the source", () => {
    for (const f of ["src/styles/tokens.css", "docs/design/DESIGN_SYSTEM.md", "docs/design/CONTRAST.md"]) {
      expect(readFileSync(f, "utf8"), f).toContain("ADR-0002");
    }
  });
});
