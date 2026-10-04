/**
 * Design-system source/compiled-CSS scanners (F2-03..F2-08, F2-17, F2-30,
 * F2-32, F2-34). Kept under tests/ because it necessarily contains the
 * colour literals it hunts for (the F2-04 scan covers src/ only).
 *
 * Uses PostCSS and postcss-selector-parser, so rules inside @media,
 * @supports, CSS nesting and :is()/:where() lists are all checked.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import postcss, { type Declaration, type Root, type Rule } from "postcss";
import selectorParser from "postcss-selector-parser";

export interface SourceFile {
  path: string;
  text: string;
}
export interface Problem {
  path: string;
  line?: number | undefined;
  rule: string;
  message: string;
}

// ---------------------------------------------------------------- files

export function walkFiles(dir: string, exts: string[]): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return walkFiles(p, exts);
    return exts.includes(extname(n)) ? [p] : [];
  });
}

export function readSources(dir: string, exts = [".css", ".astro", ".ts", ".tsx"]): SourceFile[] {
  return walkFiles(dir, exts).map((path) => ({ path, text: readFileSync(path, "utf8") }));
}

export const isTokensFile = (path: string): boolean => /(^|[\\/])tokens\.css$/.test(path);

/** CSS chunks in a file: whole file for .css, every <style> block for .astro. */
export function cssChunks(file: SourceFile): { css: string; lineOffset: number }[] {
  if (file.path.endsWith(".css")) return [{ css: file.text, lineOffset: 0 }];
  if (file.path.endsWith(".astro")) {
    const out: { css: string; lineOffset: number }[] = [];
    // Blank out the frontmatter (keeping line numbers) so "<style>" in a comment isn't read as CSS.
    const text = file.text.replace(/^---[\s\S]*?\n---/, (fm) => fm.replace(/[^\n]/g, " "));
    for (const m of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\b[^>]*>/gi)) {
      const before = text.slice(0, (m.index ?? 0) + m[0].indexOf(">") + 1);
      out.push({ css: m[1] ?? "", lineOffset: before.split("\n").length - 1 });
    }
    return out;
  }
  return [];
}

export function parseChunks(file: SourceFile): { root: Root; lineOffset: number }[] {
  return cssChunks(file).map(({ css, lineOffset }) => ({ root: postcss.parse(css, { from: file.path }), lineOffset }));
}

const lineOf = (node: { source?: { start?: { line: number } } }, offset: number) =>
  node.source?.start ? node.source.start.line + offset : undefined;

// ---------------------------------------------------------------- selectors

/** Split on top-level commas (outside parentheses/brackets). */
function splitTopLevel(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of list) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Expand :is()/:where()/:matches() lists into separate plain selectors. */
export function expandSelector(selector: string): string[] {
  const m = /:(?:is|where|matches|-webkit-any)\(/i.exec(selector);
  if (!m) return [selector.trim()];
  const open = m.index + m[0].length;
  let depth = 1;
  let i = open;
  for (; i < selector.length && depth > 0; i++) {
    if (selector[i] === "(") depth++;
    else if (selector[i] === ")") depth--;
  }
  const inner = selector.slice(open, i - 1);
  const before = selector.slice(0, m.index);
  const after = selector.slice(i);
  return splitTopLevel(inner).flatMap((part) => expandSelector(`${before}${part}${after}`));
}

/** Drop :not(...) contents so `:not(.surface-navy)` never counts as scoping. */
function withoutNot(selector: string): string {
  return selectorParser((root) => {
    root.walkPseudos((p) => {
      if (p.value.toLowerCase() === ":not") p.remove();
    });
  }).processSync(selector);
}

export type Surface = "dark" | "light" | "none";

/** The surface a selector targets: decided by the LAST surface class in it. */
export function surfaceOf(selector: string): Surface {
  const cleaned = withoutNot(selector);
  let last: Surface = "none";
  selectorParser((root) => {
    root.walkClasses((c) => {
      if (c.value === "surface-navy" || c.value === "surface-slate") last = "dark";
      else if (c.value === "surface-white" || c.value === "surface-alabaster") last = "light";
    });
  }).processSync(cleaned);
  return last;
}

/** Effective selectors for a rule, resolving CSS nesting through parents. */
export function effectiveSelectors(rule: Rule): string[] {
  const own = rule.selectors;
  let parent = rule.parent;
  while (parent && parent.type !== "rule" && parent.type !== "root") parent = parent.parent;
  if (!parent || parent.type !== "rule") return own.flatMap(expandSelector);
  const parents = effectiveSelectors(parent as Rule);
  const out: string[] = [];
  for (const p of parents) {
    for (const s of own) {
      out.push(s.includes("&") ? s.replace(/&/g, `:is(${p})`) : `${p} ${s}`);
    }
  }
  return out.flatMap(expandSelector);
}

function declSelectors(decl: Declaration): string[] | null {
  let p = decl.parent;
  while (p && p.type !== "rule" && p.type !== "root") p = p.parent;
  return p && p.type === "rule" ? effectiveSelectors(p as Rule) : null;
}

// ---------------------------------------------------------------- gold rule

const GOLD_LITERAL = /#c5a059(?:ff)?\b|rgba?\(\s*197\s*,\s*160\s*,\s*89\s*(?:,\s*(?:1|1\.0|100%)\s*)?\)/i;
const GOLD_ON_LIGHT_LITERAL = /#7e6026(?:ff)?\b|rgba?\(\s*126\s*,\s*96\s*,\s*38\s*(?:,\s*(?:1|1\.0|100%)\s*)?\)/i;

const varRefs = (value: string): string[] => [...value.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1] ?? "");

/** Custom properties whose value is (transitively) the given colour. */
export function aliasesOf(roots: Root[], base: string, literal: RegExp): Set<string> {
  const defs: { prop: string; value: string }[] = [];
  for (const r of roots) {
    r.walkDecls((d) => {
      if (d.prop.startsWith("--")) defs.push({ prop: d.prop, value: d.value });
    });
  }
  const set = new Set<string>([base]);
  for (let changed = true; changed;) {
    changed = false;
    for (const { prop, value } of defs) {
      if (set.has(prop)) continue;
      if (literal.test(value) || varRefs(value).some((v) => set.has(v))) {
        set.add(prop);
        changed = true;
      }
    }
  }
  return set;
}

export interface GoldScanOptions {
  /** Files allowed to contain the gold literal (tokens.css in source; :root in dist). */
  literalAllowed?: (path: string) => boolean;
  /** Extra stylesheets to learn aliases from (e.g. tokens.css when scanning one fixture). */
  aliasSources?: SourceFile[];
}

/**
 * F2-06: fails if the gold literal appears outside tokens.css, or a declaration
 * uses gold (literal, var(--color-gold) or any alias) in a rule where any
 * selector isn't scoped to a navy/slate surface. Also fails the reverse:
 * gold-on-light (#7E6026 or an alias) used in a rule scoped to a dark surface.
 */
export function scanGold(files: SourceFile[], opts: GoldScanOptions = {}): Problem[] {
  const literalAllowed = opts.literalAllowed ?? isTokensFile;
  const problems: Problem[] = [];
  const parsed = [...files, ...(opts.aliasSources ?? [])].map((f) => ({ f, chunks: parseChunks(f) }));
  const allRoots = parsed.flatMap((p) => p.chunks.map((c) => c.root));
  const goldAliases = aliasesOf(allRoots, "--color-gold", GOLD_LITERAL);
  const lightAliases = aliasesOf(allRoots, "--color-gold-on-light", GOLD_ON_LIGHT_LITERAL);

  for (const file of files) {
    // (a) literal outside tokens.css in .astro/.ts/.tsx (markup, <style>, colour strings).
    if (!literalAllowed(file.path) && !file.path.endsWith(".css") && GOLD_LITERAL.test(file.text)) {
      problems.push({ path: file.path, rule: "gold-literal", message: "gold literal outside tokens.css" });
    }
    for (const { root, lineOffset } of parseChunks(file)) {
      root.walkDecls((decl) => {
        const usesGold = GOLD_LITERAL.test(decl.value) || varRefs(decl.value).some((v) => goldAliases.has(v));
        const usesGoldOnLight =
          GOLD_ON_LIGHT_LITERAL.test(decl.value) || varRefs(decl.value).some((v) => lightAliases.has(v));
        const sels = declSelectors(decl);
        const isRoot = sels !== null && sels.every((s) => s === ":root");
        if (GOLD_LITERAL.test(decl.value) && file.path.endsWith(".css") && !literalAllowed(file.path) && !isRoot) {
          problems.push({
            path: file.path,
            line: lineOf(decl, lineOffset),
            rule: "gold-literal",
            message: `gold literal in ${decl.prop}`,
          });
        }
        if (decl.prop.startsWith("--")) return; // definitions are checked where they are used
        if (usesGold) {
          const bad = (sels ?? ["<no selector>"]).filter((s) => surfaceOf(s) !== "dark");
          if (bad.length) {
            problems.push({
              path: file.path,
              line: lineOf(decl, lineOffset),
              rule: "gold-unscoped",
              message: `${decl.prop}: ${decl.value} used by selector(s) not on navy/slate: ${bad.join(", ")}`,
            });
          }
        }
        if (usesGoldOnLight) {
          const bad = (sels ?? []).filter((s) => surfaceOf(s) === "dark");
          if (bad.length) {
            problems.push({
              path: file.path,
              line: lineOf(decl, lineOffset),
              rule: "gold-on-light-on-dark",
              message: `${decl.prop}: ${decl.value} (#7E6026) used on a dark surface: ${bad.join(", ")}`,
            });
          }
        }
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------- F2-03 tokens

const TOKEN_PREFIX = /^--(color|font|step|space|radius|motion)(-|$)/;

export function scanTokenDeclarations(files: SourceFile[]): Problem[] {
  const problems: Problem[] = [];
  for (const file of files) {
    for (const { root, lineOffset } of parseChunks(file)) {
      root.walkDecls((d) => {
        if (!d.prop.startsWith("--")) return;
        const sels = declSelectors(d) ?? [];
        if (!isTokensFile(file.path) && TOKEN_PREFIX.test(d.prop)) {
          problems.push({
            path: file.path,
            line: lineOf(d, lineOffset),
            rule: "token-outside-tokens",
            message: `${d.prop} declared outside tokens.css`,
          });
        } else if (isTokensFile(file.path) && !sels.every((s) => s === ":root")) {
          problems.push({
            path: file.path,
            line: lineOf(d, lineOffset),
            rule: "token-not-root",
            message: `${d.prop} declared outside :root`,
          });
        } else if (!isTokensFile(file.path)) {
          problems.push({
            path: file.path,
            line: lineOf(d, lineOffset),
            rule: "custom-property",
            message: `custom property ${d.prop} outside tokens.css (none are documented as component-local)`,
          });
        }
      });
    }
  }
  return problems;
}

/** Custom properties defined in :root of tokens.css. */
export function definedTokens(tokens: SourceFile): Set<string> {
  const set = new Set<string>();
  postcss.parse(tokens.text).walkDecls((d) => {
    if (d.prop.startsWith("--")) set.add(d.prop);
  });
  return set;
}

// ---------------------------------------------------------------- F2-04 stray colours

const NAMED_COLOURS =
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen canvas canvastext linktext visitedtext activetext buttonface buttontext field fieldtext highlight highlighttext graytext mark marktext".split(
    " ",
  );
const COLOUR_PROP =
  /(^|-)(color|background|border|outline|fill|stroke|shadow|caret|accent|column-rule|text-decoration|text-emphasis)/;
const HEX = /(?<![\w&-])#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})(?![\w-])/i;
const COLOUR_FN = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(/i;

export function scanStrayColours(files: SourceFile[]): Problem[] {
  const problems: Problem[] = [];
  for (const file of files) {
    if (isTokensFile(file.path)) continue;
    const lines = file.text.split("\n");
    lines.forEach((line, i) => {
      if (HEX.test(line) || COLOUR_FN.test(line)) {
        problems.push({ path: file.path, line: i + 1, rule: "stray-colour", message: line.trim().slice(0, 120) });
      }
    });
    for (const { root, lineOffset } of parseChunks(file)) {
      root.walkDecls((d) => {
        if (!COLOUR_PROP.test(d.prop)) return;
        const words = d.value
          .toLowerCase()
          .replace(/var\([^)]*\)|url\([^)]*\)/g, " ")
          .split(/[^a-z]+/);
        const named = words.filter((w) => NAMED_COLOURS.includes(w));
        if (named.length) {
          problems.push({
            path: file.path,
            line: lineOf(d, lineOffset),
            rule: "named-colour",
            message: `${d.prop}: ${d.value}`,
          });
        }
      });
    }
    // SVG fill/stroke attributes in markup must not be literals.
    for (const m of file.text.matchAll(/\s(fill|stroke)\s*=\s*["']([^"']*)["']/gi)) {
      const v = (m[2] ?? "").trim().toLowerCase();
      if (!["currentcolor", "none", "transparent", "inherit"].includes(v) && !v.startsWith("url(#")) {
        problems.push({ path: file.path, rule: "svg-literal", message: `${m[1]}="${m[2]}"` });
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------- F2-05 var() resolution

export function scanVarResolution(files: SourceFile[], defined: Set<string>): Problem[] {
  const problems: Problem[] = [];
  for (const file of files) {
    const lines = file.text.split("\n");
    lines.forEach((line, i) => {
      for (const ref of varRefs(line)) {
        if (!defined.has(ref))
          problems.push({
            path: file.path,
            line: i + 1,
            rule: "unknown-var",
            message: `var(${ref}) is not defined in tokens.css`,
          });
      }
    });
  }
  return problems;
}

// ---------------------------------------------------------------- F2-17 breakpoints

export const BREAKPOINTS = ["30rem", "48rem", "64rem"] as const;

export function scanBreakpoints(files: SourceFile[]): Problem[] {
  const problems: Problem[] = [];
  for (const file of files) {
    for (const { root, lineOffset } of parseChunks(file)) {
      root.walkAtRules(/^(media|container)$/i, (at) => {
        for (const m of at.params.matchAll(
          /\(\s*((?:min|max)-)?(width|inline-size)\s*:\s*([^)]+)\)|\(\s*width\s*[<>]=?\s*([^)]+)\)/gi,
        )) {
          const kind = m[1]?.toLowerCase();
          const value = (m[3] ?? m[4] ?? "").trim();
          if (kind !== "min-" || m[4] !== undefined) {
            problems.push({
              path: file.path,
              line: lineOf(at, lineOffset),
              rule: "not-mobile-first",
              message: `@${at.name} ${at.params}: use min-width`,
            });
          }
          if (!(BREAKPOINTS as readonly string[]).includes(value)) {
            problems.push({
              path: file.path,
              line: lineOf(at, lineOffset),
              rule: "unknown-breakpoint",
              message: `@${at.name} ${at.params}: ${value} is not one of ${BREAKPOINTS.join(", ")}`,
            });
          }
        }
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------- F2-30 focus

export function scanOutlineRemoval(files: SourceFile[]): Problem[] {
  const problems: Problem[] = [];
  for (const file of files) {
    for (const { root, lineOffset } of parseChunks(file)) {
      root.walkRules((rule) => {
        const decls = rule.nodes.filter((n): n is Declaration => n.type === "decl");
        const removes = decls.find(
          (d) => /^outline(-style|-width)?$/.test(d.prop) && /^(none|0)(\s|$|!)/.test(d.value.trim()),
        );
        if (!removes) return;
        const replaced = decls.some(
          (d) =>
            d !== removes &&
            (/^box-shadow$/.test(d.prop) || (/^outline/.test(d.prop) && !/^(none|0)/.test(d.value.trim()))),
        );
        if (!replaced) {
          problems.push({
            path: file.path,
            line: lineOf(removes, lineOffset),
            rule: "outline-removed",
            message: `${rule.selector} removes the outline without a replacement`,
          });
        }
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------- F2-32 motion

export function scanMotion(files: SourceFile[]): Problem[] {
  const problems: Problem[] = [];
  for (const file of files) {
    for (const { root, lineOffset } of parseChunks(file)) {
      root.walkDecls(/^(transition|animation)(-duration|-timing-function|-delay|-iteration-count)?$/, (d) => {
        const v = d.value.replace(/!important/, "").trim();
        if (/^(none|0s?)$/.test(v)) return;
        if (/infinite/.test(v)) {
          problems.push({
            path: file.path,
            line: lineOf(d, lineOffset),
            rule: "motion-loop",
            message: `${d.prop}: ${d.value} loops`,
          });
        }
        const durations = v.match(/(?<![\w-])\d*\.?\d+m?s\b/g) ?? [];
        if (
          durations.length ||
          ((d.prop === "transition" || d.prop === "animation") && !/var\(--motion-duration-/.test(v))
        ) {
          problems.push({
            path: file.path,
            line: lineOf(d, lineOffset),
            rule: "motion-token",
            message: `${d.prop}: ${d.value} must use --motion-* tokens`,
          });
        }
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------- F2-34 astro directives

/** JsonLd.astro is the single documented exception for set:html (F1-31). */
export function scanAstroDirectives(files: SourceFile[]): Problem[] {
  const problems: Problem[] = [];
  for (const file of files) {
    if (!file.path.endsWith(".astro")) continue;
    const markup = file.text.replace(/^---[\s\S]*?---/, "").replace(/<style\b[\s\S]*?<\/style\b[^>]*>/gi, "");
    if (/define:vars/.test(file.text))
      problems.push({ path: file.path, rule: "define-vars", message: "define:vars is not allowed" });
    if (/set:html/.test(markup) && !/[\\/]JsonLd\.astro$/.test(file.path)) {
      problems.push({ path: file.path, rule: "set-html", message: "set:html is only allowed in JsonLd.astro" });
    }
    if (/\sstyle\s*=/.test(markup))
      problems.push({
        path: file.path,
        rule: "style-attr",
        message: "style attribute/prop not allowed (CSP style-src 'self')",
      });
    if (/<script\b(?![^>]*type="application\/ld\+json")/i.test(markup)) {
      problems.push({ path: file.path, rule: "script", message: "<script> in a component; F2 components are static" });
    }
  }
  return problems;
}
