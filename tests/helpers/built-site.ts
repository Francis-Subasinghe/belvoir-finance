/**
 * Checks shared by tests/build (dist/) and tests/gallery (dist-gallery/).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import postcss from "postcss";
import { type Problem, aliasesOf, effectiveSelectors, scanGold, surfaceOf } from "./design-scan";

export function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function requireBuild(dir: string): string[] {
  if (!existsSync(dir)) throw new Error(`${dir}/ not found: build it first`);
  const files = walk(dir);
  if (!files.some((f) => f.endsWith(".html"))) throw new Error(`no HTML pages in ${dir}/`);
  return files;
}

/** F2-08: gold in compiled CSS. Only :root may hold the literal; every use is surface-scoped. */
export function compiledGold(files: string[]): { problems: Problem[]; goldRules: number } {
  const css = files.filter((f) => f.endsWith(".css")).map((path) => ({ path, text: readFileSync(path, "utf8") }));
  const problems = scanGold(css, { literalAllowed: () => false });
  // Count the gold-using rules so the check can't pass vacuously.
  const roots = css.map((f) => postcss.parse(f.text));
  const aliases = aliasesOf(roots, "--color-gold", /#c5a059/i);
  let goldRules = 0;
  for (const r of roots) {
    r.walkRules((rule) => {
      if (rule.selector === ":root") return;
      const uses = rule.nodes.some(
        (n) => n.type === "decl" && [...n.value.matchAll(/var\((--[\w-]+)/g)].some((m) => aliases.has(m[1] ?? "")),
      );
      if (uses) {
        goldRules++;
        for (const s of effectiveSelectors(rule)) {
          if (surfaceOf(s) !== "dark") problems.push({ path: "compiled", rule: "gold-unscoped", message: s });
        }
      }
    });
  }
  return { problems, goldRules };
}

/** F2-40: gallery paths or references in a build. */
export const GALLERY_MARKERS = [
  /data-testid="design-gallery"/,
  /\/design\/(?:wireframes\/)?/,
  /\bdesign-gallery\b/,
  /\bgallery-(?:section|surface|label|grid)\b/,
];

export function galleryLeaks(dir: string, files: string[]): string[] {
  const leaks: string[] = [];
  for (const f of files) {
    const rel = relative(dir, f).replace(/\\/g, "/");
    if (/(^|\/)design(\/|$)/.test(rel) || /gallery/i.test(rel)) leaks.push(`path: ${rel}`);
    if (/\.(html|js|mjs|css|txt|json|xml)$/.test(f)) {
      const text = readFileSync(f, "utf8");
      for (const m of GALLERY_MARKERS) if (m.test(text)) leaks.push(`${rel}: ${m.source}`);
    }
  }
  return leaks;
}

export function cspOf(html: string): string {
  return (/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? "").replace(/&#39;/g, "'");
}

/** The site CSP (F1 + Aegis Q-9), defined once in tests/helpers/csp.ts. */
export { SITE_CSP } from "./csp";
