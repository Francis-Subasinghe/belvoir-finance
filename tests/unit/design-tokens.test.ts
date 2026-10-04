import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "../../src/lib/contrast";

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

// [label, foreground token, background token, minimum ratio]
const PAIRS: [string, string, string, number][] = [
  ["Body text on alabaster", "color-text", "color-alabaster", 4.5],
  ["Body text on white", "color-text", "color-white", 4.5],
  ["Muted text on alabaster", "color-text-muted", "color-alabaster", 4.5],
  ["Headings (navy) on alabaster", "color-navy", "color-alabaster", 4.5],
  ["Link / gold-on-light on white", "color-gold-on-light", "color-white", 4.5],
  ["Link / gold-on-light on alabaster", "color-gold-on-light", "color-alabaster", 4.5],
  ["Gold on navy", "color-gold", "color-navy", 4.5],
  ["Gold on slate", "color-gold", "color-slate", 4.5],
  ["Text on navy", "color-text-on-dark", "color-navy", 4.5],
  ["Text on slate", "color-text-on-dark", "color-slate", 4.5],
  ["Notice text on notice background", "color-notice-text", "color-notice-bg", 4.5],
  ["Gold-on-light (links, focus) on notice background", "color-gold-on-light", "color-notice-bg", 4.5],
  ["Focus ring on alabaster", "color-focus", "color-alabaster", 3],
  ["Focus ring (dark) on navy", "color-focus-on-dark", "color-navy", 3],
  ["Strong border on white (callout, demo banner)", "color-border-strong", "color-white", 3],
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

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return cssFiles(p);
    return /\.(css|astro)$/.test(n) ? [p] : [];
  });
}

describe("F1-24 gold is only used on navy or slate", () => {
  const files = cssFiles("src");

  it("the #C5A059 literal appears only in tokens.css", () => {
    const offenders = files.filter((f) => !f.endsWith("tokens.css") && /#c5a059/i.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("var(--color-gold) appears only in rules scoped to .surface-navy or .surface-slate", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const css = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = (m[1] ?? "").trim();
        const body = m[2] ?? "";
        if (!/var\(--color-gold\)/.test(body)) continue;
        const parts = selector.split(",").map((s) => s.trim());
        if (!parts.every((s) => /^\.surface-(navy|slate)\b/.test(s))) offenders.push(`${f}: ${selector}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
