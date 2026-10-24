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

// V2 (ADR-0003) replaces the ADR-0002 navy/slate/gold palette; the F1 test IDs are kept.
describe("F1-22 brand tokens", () => {
  it.each([
    ["color-canvas", "#fbfbf9"],
    ["color-surface", "#efefea"],
    ["color-surface-2", "#e6e6e0"],
    ["color-sand", "#d4c4a8"],
    ["color-ink", "#0a0a0a"],
    ["color-ink-muted", "#4a4a45"],
    ["color-ink-subtle", "#6b6b64"],
    ["color-green", "#2c5f34"],
    ["color-green-deep", "#1f4426"],
    ["color-gold-bright", "#f2c94c"],
    ["color-gold-soft", "#d4c098"],
    ["color-gold-on-light", "#7a5a0a"],
    ["color-border", "#e6e6e0"],
    ["color-border-strong", "#6b6b64"],
    ["color-white", "#ffffff"],
  ])("--%s is %s", (name, hex) => {
    expect(token(name)).toBe(hex);
  });

  it("F1-23 defines display/serif, sans and mono/tabular numeral tokens", () => {
    expect(tokensCss).toMatch(/--font-display: "Fraunces", "Fraunces Fallback",.*serif/);
    expect(tokensCss).toMatch(/--font-sans:.*sans-serif/);
    expect(tokensCss).toMatch(/--font-mono:.*monospace/);
    expect(tokensCss).toMatch(/--numeric:\s*tabular-nums/);
  });
});

// [label, foreground token, background token, minimum ratio]. Must match the
// "Pairs in use" table in docs/design/CONTRAST.md row for row (F2-11, V2-26, V2-27).
const PAIRS: [string, string, string, number][] = [
  ["Body text on canvas", "color-text", "color-canvas", 4.5],
  ["Body text on surface", "color-text", "color-surface", 4.5],
  ["Body text on surface-2", "color-text", "color-surface-2", 4.5],
  ["Body text on sand", "color-text", "color-sand", 4.5],
  ["Body text on white", "color-text", "color-white", 4.5],
  ["Body text on hover background", "color-text", "color-hover-bg", 4.5],
  ["Body text on info notice", "color-text", "color-status-info-bg", 4.5],
  ["Body text on success notice", "color-text", "color-status-success-bg", 4.5],
  ["Body text on warning notice", "color-text", "color-status-warning-bg", 4.5],
  ["Body text on error notice", "color-text", "color-status-error-bg", 4.5],
  ["Muted text on canvas", "color-text-muted", "color-canvas", 4.5],
  ["Muted text on surface", "color-text-muted", "color-surface", 4.5],
  ["Muted text on surface-2", "color-text-muted", "color-surface-2", 4.5],
  ["Subtle text on canvas", "color-ink-subtle", "color-canvas", 4.5],
  ["Headings (ink) on canvas", "color-ink", "color-canvas", 4.5],
  ["Headings (ink) on surface", "color-ink", "color-surface", 4.5],
  ["Link (green) on canvas", "color-link", "color-canvas", 4.5],
  ["Link (green) on surface", "color-link", "color-surface", 4.5],
  ["Link (green) on surface-2", "color-link", "color-surface-2", 4.5],
  ["Link (green) on white", "color-link", "color-white", 4.5],
  ["Link hover (green-deep) on canvas", "color-link-hover", "color-canvas", 4.5],
  ["Link hover (green-deep) on surface", "color-link-hover", "color-surface", 4.5],
  ["Gold-on-light on canvas", "color-gold-on-light", "color-canvas", 4.5],
  ["Gold-on-light on surface", "color-gold-on-light", "color-surface", 4.5],
  ["Gold-on-light on surface-2", "color-gold-on-light", "color-surface-2", 4.5],
  ["Gold-on-light on white", "color-gold-on-light", "color-white", 4.5],
  ["Text on ink", "color-text-on-dark", "color-ink", 4.5],
  ["Text on green", "color-text-on-dark", "color-green", 4.5],
  ["Text on green-deep", "color-text-on-dark", "color-green-deep", 4.5],
  ["Gold-soft on ink", "color-gold-soft", "color-ink", 4.5],
  ["Gold-soft on green-deep", "color-gold-soft", "color-green-deep", 4.5],
  ["Gold-bright on ink", "color-gold-bright", "color-ink", 4.5],
  ["Gold-bright on green-deep", "color-gold-bright", "color-green-deep", 4.5],
  ["Notice text on notice background", "color-notice-text", "color-notice-bg", 4.5],
  ["Primary button text", "color-button-primary-text", "color-button-primary-bg", 4.5],
  ["Primary button text on hover", "color-button-primary-text", "color-button-primary-hover-bg", 4.5],
  ["Disabled text on disabled background", "color-disabled-text", "color-disabled-bg", 4.5],
  ["Error text on canvas", "color-error", "color-canvas", 4.5],
  ["Error text on surface", "color-error", "color-surface", 4.5],
  ["Error text on white", "color-error", "color-white", 4.5],
  ["Info label on info background", "color-status-info-accent", "color-status-info-bg", 4.5],
  ["Success label on success background", "color-status-success-accent", "color-status-success-bg", 4.5],
  ["Warning label on warning background", "color-status-warning-accent", "color-status-warning-bg", 4.5],
  ["Error label on error background", "color-status-error-accent", "color-status-error-bg", 4.5],
  ["Fact label on surface", "color-callout-fact", "color-surface", 4.5],
  ["Estimate label on surface", "color-callout-estimate", "color-surface", 4.5],
  ["Example label on surface", "color-callout-example", "color-surface", 4.5],
  ["Opinion label on surface", "color-callout-opinion", "color-surface", 4.5],
  ["Chart text on chart background", "color-text", "color-chart-bg", 4.5],
  ["Chart series 1 on chart background", "color-chart-series-1", "color-chart-bg", 3],
  ["Chart series 2 on chart background", "color-chart-series-2", "color-chart-bg", 3],
  ["Chart axis on chart background", "color-chart-axis", "color-chart-bg", 3],
  ["Strong border on canvas", "color-border-strong", "color-canvas", 3],
  ["Strong border on surface", "color-border-strong", "color-surface", 3],
  ["Strong border on white", "color-border-strong", "color-white", 3],
  ["Strong border on hover background", "color-border-strong", "color-hover-bg", 3],
  ["Error border on canvas", "color-error", "color-canvas", 3],
  ["Primary button boundary on canvas", "color-button-primary-bg", "color-canvas", 3],
  ["Primary button boundary on surface", "color-button-primary-bg", "color-surface", 3],
  ["Primary button boundary on sand", "color-button-primary-bg", "color-sand", 3],
  ["Focus ring (ink) on canvas", "color-focus", "color-canvas", 3],
  ["Focus ring (ink) on surface", "color-focus", "color-surface", 3],
  ["Focus ring (ink) on surface-2", "color-focus", "color-surface-2", 3],
  ["Focus ring (ink) on sand", "color-focus", "color-sand", 3],
  ["Focus ring (ink) on white", "color-focus", "color-white", 3],
  ["Focus ring (ink) on notice background", "color-focus", "color-notice-bg", 3],
  ["Focus inner ring (canvas) on green", "color-focus-inner", "color-green", 3],
  ["Focus inner ring (canvas) on green-deep", "color-focus-inner", "color-green-deep", 3],
  ["Focus inner ring (canvas) on ink", "color-focus-inner", "color-ink", 3],
  ["Focus ring on ink", "color-focus-on-dark", "color-ink", 3],
  ["Focus ring on green-deep", "color-focus-on-dark", "color-green-deep", 3],
  ["Focus ring on green", "color-focus-on-dark", "color-green", 3],
  ["Icon (ink) on surface", "color-ink", "color-surface", 3],
  ["Eyebrow icon (gold-on-light) on canvas", "color-gold-on-light", "color-canvas", 3],
  ["Eyebrow icon (gold-soft) on ink", "color-gold-soft", "color-ink", 3],
  ["Art line (green) on surface", "color-green", "color-surface", 3],
  ["Diagram outline on white", "color-border-strong", "color-white", 3],
  ["Diagram arrow (teal) on white", "color-chart-series-2", "color-white", 3],
  ["Diagram dots (green) on white", "color-green", "color-white", 3],
  ["Diagram coin (gold-on-light) on white", "color-gold-on-light", "color-white", 3],
  ["Diagram coin mark (white) on gold-on-light", "color-white", "color-gold-on-light", 3],
];

describe("F1-24 / F1-25 contrast", () => {
  it.each(PAIRS)("%s meets its minimum", (_label, fg, bg, min) => {
    expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(min);
  });

  it("V2-26 gold-on-light measures 6.15:1 on canvas, 5.53:1 on surface and 5.09:1 on surface-2", () => {
    expect(contrastRatio("#7a5a0a", "#fbfbf9").toFixed(2)).toBe("6.15");
    expect(contrastRatio("#7a5a0a", "#efefea").toFixed(2)).toBe("5.53");
    expect(contrastRatio("#7a5a0a", "#e6e6e0").toFixed(2)).toBe("5.09");
  });

  it("V2-28 gold-bright fails on light surfaces (why the gold rule exists), and ink on green is why the ring is two-tone", () => {
    expect(contrastRatio(token("color-gold-bright"), token("color-canvas")).toFixed(2)).toBe("1.53");
    expect(contrastRatio(token("color-gold-bright"), token("color-canvas"))).toBeLessThan(3);
    expect(contrastRatio(token("color-ink"), token("color-green"))).toBeLessThan(3);
  });

  it("V2-26 forbidden text pairs really fail (ink-subtle on surface-2, green normal text on sand)", () => {
    expect(contrastRatio(token("color-ink-subtle"), token("color-surface-2"))).toBeLessThan(4.5);
    expect(contrastRatio(token("color-green"), token("color-sand"))).toBeLessThan(4.5);
    const labels = PAIRS.map(([l]) => l);
    expect(labels.some((l) => /subtle.*surface-2/i.test(l))).toBe(false);
    expect(labels.some((l) => /green.*sand/i.test(l))).toBe(false);
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
    expect(css).toMatch(/\.input \{[^}]*border: var\(--border-width\) solid var\(--color-border-strong\);/);
    expect(css).toMatch(/\.input\[aria-invalid="true"\] \{[^}]*border-color: var\(--color-error\);/);
  });
  it.each([
    ["color-border-strong", "color-white"],
    ["color-border-strong", "color-canvas"],
    ["color-border-strong", "color-surface"],
    ["color-border-strong", "color-hover-bg"],
    ["color-error", "color-white"],
    ["color-button-primary-bg", "color-canvas"],
  ])("%s on %s is at least 3:1", (fg, bg) => {
    expect(contrastRatio(token(fg), token(bg))).toBeGreaterThanOrEqual(3);
  });
  it("--color-border is decorative only (1.21:1 on canvas) and is never an input boundary", () => {
    expect(contrastRatio(token("color-border"), token("color-canvas")).toFixed(2)).toBe("1.21");
    const css = readFileSync("src/styles/components.css", "utf8");
    for (const sel of [".input", ".checkbox", ".button"]) {
      const block = new RegExp(`\\${sel} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";
      expect(block, sel).not.toContain("--color-border)");
    }
  });
});

describe("F1-24 gold is only used on ink, green or green-deep (V2-28)", () => {
  // F1's regex scan is replaced by the PostCSS scanner in tests/unit/design-system.test.ts (F2-06),
  // which also covers nested rules, @media, :is() and aliases. This keeps the F1 test name.
  it("the PostCSS gold scan over src/ finds nothing", () => {
    expect(scanGold(readSources("src"))).toEqual([]);
  });
});

describe("ADR-0003 is the source of the palette and fonts", () => {
  const adr = readFileSync("docs/decisions/ADR-0003-v2-palette-type.md", "utf8");

  it.each([
    ["Canvas", "color-canvas"],
    ["Surface", "color-surface"],
    ["Surface 2", "color-surface-2"],
    ["Sand", "color-sand"],
    ["Ink", "color-ink"],
    ["Ink muted", "color-ink-muted"],
    ["Ink subtle", "color-ink-subtle"],
    ["Green", "color-green"],
    ["Green deep", "color-green-deep"],
    ["Gold bright", "color-gold-bright"],
    ["Gold soft", "color-gold-soft"],
    ["Gold on light", "color-gold-on-light"],
    ["White", "color-white"],
  ])("palette row %s matches --%s", (row, name) => {
    const m = new RegExp(`^\\| ${row} \\| \`(#[0-9A-Fa-f]{6})\``, "m").exec(adr);
    expect(m?.[1], `ADR-0003 row ${row}`).toBeDefined();
    expect(token(name)).toBe(m?.[1]?.toLowerCase());
  });

  it("the @font-face rules are exactly ADR-0003's families and weights", () => {
    const css = readFileSync("src/styles/fonts.css", "utf8");
    const faces = [...css.matchAll(/font-family: "([^"]+)";[\s\S]*?font-weight: (\d+);/g)].map(
      (m) => `${m[1]} ${m[2]}`,
    );
    expect(faces.sort()).toEqual(
      ["Fraunces 300", "Fraunces 400", "Inter 400", "Inter 600", "IBM Plex Mono 400"].sort(),
    );
    expect(readFileSync("src/styles/global.css", "utf8")).not.toMatch(/@fontsource/);
    expect(adr).toMatch(/Fraunces \(300, 400\)/);
    expect(adr).toMatch(/Inter \(400, 600\)/);
    expect(adr).toMatch(/IBM Plex Mono \(400\)/);
    expect(tokensCss).toMatch(/--font-sans: "Inter"/);
    expect(tokensCss).toMatch(/--font-mono: "IBM Plex Mono"/);
  });

  it("the design docs cite ADR-0003 as the source", () => {
    for (const f of ["src/styles/tokens.css", "docs/design/DESIGN_SYSTEM.md", "docs/design/CONTRAST.md"]) {
      expect(readFileSync(f, "utf8"), f).toContain("ADR-0003");
    }
  });
});
