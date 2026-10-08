/**
 * V1 checks over built HTML (dist/ and dist-gallery/): the Aegis SVG rules on
 * every inline <svg> (V1-13), per-page id collisions (V1-10), decorative vs
 * meaningful marking (V1-18 / V1-19), reserved dimensions (V1-35) and the
 * per-page inline-SVG budget (V1-33). One function per concern so the unit
 * fixtures and the build tests share the code.
 */
import { checkSvg, inlineSvgs, pageIdCollisions, type SvgKind } from "./svg-check";

export const INLINE_SVG_PAGE_CAP = 40 * 1024;
export const GZIP_GROWTH_CAP = 15 * 1024;

export interface PageProblem {
  page: string;
  rule: string;
  message: string;
}

const openTag = (svg: string) => /^<svg\b[^>]*>/i.exec(svg)?.[0] ?? "";
const attr = (tag: string, name: string) => new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag)?.[1];
const hasClass = (tag: string, c: string) => (attr(tag, "class") ?? "").split(/\s+/).includes(c);

/** Byte-cap kind of an inline SVG, from its class (the component that emitted it). */
export function svgKind(svg: string): SvgKind | undefined {
  const tag = openTag(svg);
  if (hasClass(tag, "story-cover-svg")) return "cover";
  if (hasClass(tag, "icon")) return "icon";
  if (hasClass(tag, "diagram-svg")) return "diagram";
  if (hasClass(tag, "art-svg")) return attr(tag, "viewBox") === "0 0 480 300" ? "hero" : "illustration";
  return undefined;
}

/** Charts keep their <text> value labels (the table carries the data, V1-17 exempts charts). */
const isChart = (tag: string) => hasClass(tag, "chart-svg") || hasClass(tag, "chart-marker");

/** V1-18 / V1-19: decorative (aria-hidden, focusable=false, no title) or meaningful (role=img, labelled). */
export function markingProblem(svg: string): string | undefined {
  const tag = openTag(svg);
  const hidden = attr(tag, "aria-hidden") === "true";
  if (hidden) {
    if (attr(tag, "focusable") !== "false") return 'decorative SVG without focusable="false"';
    if (/<title\b/i.test(svg)) return "decorative SVG with a <title>";
    return undefined;
  }
  if (attr(tag, "role") === "img" && (attr(tag, "aria-labelledby") || attr(tag, "aria-label"))) return undefined;
  return "SVG is neither decorative (aria-hidden + focusable=false) nor meaningful (role=img with a name)";
}

/** V1-35: viewBox plus width and height attributes (class-based aspect-ratio boxes also carry them). */
export function dimensionProblem(svg: string): string | undefined {
  const tag = openTag(svg);
  if (!attr(tag, "viewBox")) return "SVG without a viewBox";
  if (!attr(tag, "width") || !attr(tag, "height")) return "SVG without width and height attributes";
  return undefined;
}

/** Every V1 rule for the inline SVGs of one page. */
export function pageSvgProblems(page: string, html: string, opts: { budget?: boolean } = {}): PageProblem[] {
  const out: PageProblem[] = [];
  const svgs = inlineSvgs(html);
  svgs.forEach((svg, i) => {
    const tag = openTag(svg);
    const where = `${page} svg #${i + 1} (${attr(tag, "class") ?? "no class"})`;
    for (const p of checkSvg(svg, { file: where, kind: svgKind(svg), decorative: !isChart(tag) }))
      out.push({ page, rule: p.rule, message: `${where}: ${p.message}` });
    const mark = markingProblem(svg);
    if (mark) out.push({ page, rule: "V1-18", message: `${where}: ${mark}` });
    const dim = dimensionProblem(svg);
    if (dim) out.push({ page, rule: "V1-35", message: `${where}: ${dim}` });
  });
  for (const id of pageIdCollisions(html)) out.push({ page, rule: "V1-10", message: `${page}: id "${id}" collides` });
  const bytes = inlineSvgBytes(html);
  if (opts.budget !== false && bytes > INLINE_SVG_PAGE_CAP)
    out.push({ page, rule: "V1-33", message: `${page}: ${bytes} bytes of inline SVG (cap ${INLINE_SVG_PAGE_CAP})` });
  return out;
}

export const inlineSvgBytes = (html: string): number =>
  inlineSvgs(html).reduce((n, s) => n + Buffer.byteLength(s, "utf8"), 0);

/** V1-35: every <img> has width and height; V1-18: every <img> has an alt attribute. */
export function imgProblems(page: string, html: string): PageProblem[] {
  return [...html.matchAll(/<img\b[^>]*>/gi)].flatMap((m) => {
    const out: PageProblem[] = [];
    if (!/\swidth\s*=/.test(m[0]) || !/\sheight\s*=/.test(m[0]))
      out.push({ page, rule: "V1-35", message: `${page}: ${m[0]} has no width/height` });
    if (!/\salt\s*=/.test(m[0])) out.push({ page, rule: "V1-18", message: `${page}: ${m[0]} has no alt` });
    return out;
  });
}

/** V1-20: a link or button whose only content is an SVG (no text, no aria-label). */
export function iconOnlyControls(page: string, html: string): PageProblem[] {
  return [...html.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi)]
    .filter((m) => /<svg\b/i.test(m[3] ?? ""))
    .filter((m) => {
      const text = (m[3] ?? "").replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, " ").replace(/<[^>]+>/g, " ");
      return text.trim() === "" && !/\saria-label\s*=/.test(m[2] ?? "");
    })
    .map((m) => ({ page, rule: "V1-20", message: `${page}: icon-only ${m[1]}` }));
}
