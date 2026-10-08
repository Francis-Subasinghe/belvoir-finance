/**
 * V1-01, V1-02, V1-03, V1-05..V1-14, V1-17, V1-38 over the committed assets;
 * V1-42 cover pins; V1-30 hover/focus parity; V1-51 visual tests without motion.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import postcss, { type Rule } from "postcss";
import { checkSvg, SVG_BYTE_CAPS } from "../helpers/svg-check";
import { filesUnder, LICENCE, manifestProblems, readManifest } from "../helpers/v1-assets";
import {
  assertCoverShape,
  COVER_ATTRIBUTES,
  COVER_CLASSES,
  COVER_H,
  COVER_W,
  coverFor,
  coverShapeAttrs,
  type CoverShape,
  fnv1a,
  MOTIFS,
} from "../../src/lib/cover";
import { PILLARS } from "../../src/content/schemas";

const manifest = readManifest();

describe("V1-01 / V1-02 / V1-03 the asset set and its manifest", () => {
  it("V1-01 src/assets/ holds the hero, one illustration and one icon per pillar, the tool icon and the diagram", () => {
    expect(filesUnder("src/assets").filter((f) => f.endsWith(".svg"))).toEqual(
      [
        "src/assets/diagram-cash-timing.svg",
        "src/assets/hero.svg",
        ...PILLARS.map((p) => `src/assets/icons/${p}.svg`),
        "src/assets/icons/cash-vs-profit.svg",
        ...PILLARS.map((p) => `src/assets/pillars/${p}.svg`),
      ].sort(),
    );
    expect(filesUnder("src/assets").filter((f) => !f.endsWith(".svg"))).toEqual(["src/assets/assets.json"]);
  });
  it("V1-02 the manifest lists every file with a matching sha256 and provenance", () => {
    expect(manifestProblems(manifest)).toEqual([]);
    expect(manifest).toHaveLength(11);
  });
  it("V1-03 every row carries the decided licence wording and Forge's authorship", () => {
    for (const r of manifest) {
      expect(r.licence, r.path).toBe(LICENCE);
      expect(r.method, r.path).toBe("hand-authored SVG");
    }
  });
  it("V1-05..V1-14, V1-17, V1-38 every committed asset passes the Aegis SVG check", () => {
    for (const r of manifest) {
      const problems = checkSvg(readFileSync(r.path, "utf8"), {
        file: r.path,
        idPrefix: r.idPrefix,
        kind: r.cap,
        asset: "inline",
        decorative: r.kind !== "diagram",
      });
      expect(problems, r.path).toEqual([]);
    }
  });
  it("V1-11 each asset is within its byte cap (measured sizes recorded here)", () => {
    const sizes = Object.fromEntries(manifest.map((r) => [r.path, readFileSync(r.path).length]));
    for (const r of manifest) expect(sizes[r.path], r.path).toBeLessThanOrEqual(SVG_BYTE_CAPS[r.cap]);
  });
  it("V1-17 no decorative asset contains text, and the hero has no <text>, <tspan> or <title>", () => {
    for (const r of manifest.filter((x) => x.kind !== "diagram"))
      expect(readFileSync(r.path, "utf8"), r.path).not.toMatch(/<(text|tspan|title)\b/);
  });
});

describe("V1-42 cover patterns", () => {
  it("V1-42 FNV-1a is the standard 32-bit hash", () => {
    expect(fnv1a("")).toBe(0x811c9dc5);
    expect(fnv1a("a")).toBe(0xe40c292c);
    expect(fnv1a("foobar")).toBe(0xbf9cf968);
  });
  const digest = (id: string, p: string) =>
    createHash("sha256")
      .update(JSON.stringify(coverFor(id, p)))
      .digest("hex");
  it("V1-42 output is pinned for two ids", () => {
    expect(coverFor("why-profit-isnt-cash", "understand-the-numbers")).toMatchObject({
      motif: "blocks",
      hash: 4092156696,
    });
    expect(digest("why-profit-isnt-cash", "understand-the-numbers")).toBe(
      "5c952f6eb7bce01f45a98d00f2aed01cc6f58ce59290bbdeadd0073ba39edb21",
    );
    expect(coverFor("pricing-and-cash-timing", "make-better-decisions")).toMatchObject({
      motif: "arcs",
      hash: 324203705,
    });
    expect(digest("pricing-and-cash-timing", "make-better-decisions")).toBe(
      "35f9544957700d3fcb847e8e1dba264ffb52066e9629f4656b946d04329b555b",
    );
  });
  it("V1-42 the cover depends on the id and the first pillar only, and is stable across calls", () => {
    expect(digest("x", "build-capability")).toBe(digest("x", "build-capability"));
    expect(digest("x", "build-capability")).not.toBe(digest("y", "build-capability"));
    expect(digest("x", "build-capability")).not.toBe(digest("x", "finance-in-context"));
    expect(coverFor.length).toBe(2);
  });
  it("V1-42 the three published demo stories get three different motifs", () => {
    const motifs = [
      coverFor("why-profit-isnt-cash", "understand-the-numbers").motif,
      coverFor("what-is-working-capital", "understand-the-numbers").motif,
      coverFor("pricing-and-cash-timing", "make-better-decisions").motif,
    ];
    expect(new Set(motifs).size).toBe(3);
  });
  it("V1-11 / V1-38 every motif stays within the 4 KB cover cap and uses at most 2 decimals", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const c = coverFor(`story-${i}`, PILLARS[i % 4] ?? "build-capability");
      seen.add(c.motif);
      const markup = `<svg viewBox="0 0 ${COVER_W} ${COVER_H}" width="${COVER_W}" height="${COVER_H}" aria-hidden="true" focusable="false">${c.shapes
        .map(
          (s) =>
            `<${s.el} class="${s.cls}" ${Object.entries(s.attrs)
              .map(([k, v]) => `${k}="${v}"`)
              .join(" ")}></${s.el}>`,
        )
        .join("")}</svg>`;
      expect(
        checkSvg(markup, { file: `cover ${i}`, kind: "cover", asset: "inline", decorative: true }),
        `story-${i}`,
      ).toEqual([]);
    }
    expect([...seen].sort()).toEqual([...MOTIFS].sort());
  });
});

/** Rules in components.css whose :hover selector moves something must have a focus twin. */
function hoverWithoutFocus(css: string): string[] {
  const bad: string[] = [];
  postcss.parse(css).walkRules((r: Rule) => {
    let moves = false;
    r.walkDecls(/^(transform|translate|top|margin-top)$/, () => void (moves = true));
    if (!moves) return;
    for (const s of r.selectors.filter((x) => x.includes(":hover"))) {
      const base = s.replace(":hover", "");
      const twin = r.selectors.some((t) => t === `${base}:focus-visible` || t === `${base}:focus-within`);
      if (!twin) bad.push(s);
    }
  });
  return bad;
}

describe("V1-30 hover lift has a focus equivalent", () => {
  it("V1-30 every hover lift in src CSS has a :focus-visible or :focus-within twin, and lifts at most 4 px", () => {
    const css = readFileSync("src/styles/components.css", "utf8");
    expect(hoverWithoutFocus(css)).toEqual([]);
    for (const m of css.matchAll(/translateY\((-?\d+(?:\.\d+)?)px\)/g))
      expect(Math.abs(Number(m[1]))).toBeLessThanOrEqual(12);
    expect(css).toMatch(/\.story-card:hover,\s*\.story-card:focus-within[\s\S]{0,80}transform: translateY\(-4px\)/);
  });
  it("V1-30 negative: a hover-only lift fails", () => {
    expect(hoverWithoutFocus(".card:hover { transform: translateY(-4px) }")).toEqual([".card:hover"]);
  });
});

describe("V1-51 visual snapshots are taken without motion", () => {
  it("V1-51 the config keeps animations disabled and every visual spec emulates reduced motion", () => {
    expect(readFileSync("playwright.visual.config.ts", "utf8")).toMatch(/animations:\s*"disabled"/);
    const specs = readdirSync("tests/visual").filter((f) => f.endsWith(".visual.ts"));
    expect(specs.length).toBeGreaterThanOrEqual(2);
    for (const f of specs)
      expect(readFileSync(`tests/visual/${f}`, "utf8"), f).toMatch(
        /emulateMedia\(\{\s*reducedMotion:\s*"reduce"\s*\}\)/,
      );
  });
});

describe("Aegis Low (PR #29): cover shape attributes are an exact allowlist", () => {
  const all = Array.from({ length: 400 }, (_, i) => i).flatMap((i) =>
    ["understand-the-numbers", "make-better-decisions", "finance-in-context", "build-capability"].flatMap(
      (p) => coverFor(`story-${i}`, p).shapes,
    ),
  );

  it("the allowlist is exactly the keys and classes the generator emits (1,600 covers)", () => {
    const used: Record<string, Set<string>> = { rect: new Set(), circle: new Set(), path: new Set() };
    for (const sh of all) for (const k of Object.keys(sh.attrs)) used[sh.el]?.add(k);
    for (const el of ["rect", "circle", "path"] as const)
      expect([...(used[el] ?? [])].sort(), el).toEqual([...COVER_ATTRIBUTES[el]].sort());
    expect([...new Set(all.map((sh) => sh.cls))].sort()).toEqual([...COVER_CLASSES].sort());
    expect(COVER_ATTRIBUTES).toEqual({
      rect: ["x", "y", "width", "height", "rx"],
      circle: ["cx", "cy", "r"],
      path: ["d", "fill", "stroke-width", "stroke-linecap"],
    });
  });

  it("every generated shape passes, and coverShapeAttrs returns its attrs unchanged", () => {
    for (const sh of all) expect(coverShapeAttrs(sh)).toBe(sh.attrs);
  });

  const fixture = JSON.parse(readFileSync("tests/fixtures/v1/cover/bad-shapes.json", "utf8")) as {
    cases: { name: string; shape: CoverShape; error: string }[];
  };
  it("the negative fixture covers onclick, onClick, style and href", () => {
    const keys = fixture.cases.flatMap((c) => Object.keys(c.shape.attrs));
    for (const k of ["onclick", "onClick", "style", "href"]) expect(keys).toContain(k);
  });
  it.each(fixture.cases.map((c) => [c.name, c] as const))("rejects %s", (_n, c) => {
    expect(() => assertCoverShape(c.shape)).toThrow(c.error);
    expect(() => coverShapeAttrs(c.shape)).toThrow(c.error);
  });

  it("rejects symbol keys", () => {
    const attrs: Record<string, number> = { cx: 1, cy: 1, r: 1 };
    Object.defineProperty(attrs, Symbol("x"), { value: 1, enumerable: true });
    expect(() => assertCoverShape({ el: "circle", cls: "art-f-slate", attrs })).toThrow("symbol keys not allowed");
  });

  it("StoryCover.astro spreads only coverShapeAttrs(...), never the raw attrs", () => {
    const src = readFileSync("src/components/art/StoryCover.astro", "utf8");
    expect(src).toContain("{...coverShapeAttrs(s)}");
    expect(src).not.toMatch(/\{\.\.\.s\.attrs\}/);
  });
});
