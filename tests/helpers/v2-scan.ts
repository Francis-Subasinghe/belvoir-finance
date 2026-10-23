/**
 * V2 scans (AC_V2_DESIGN.md v0.2). Each exported function is the real check:
 * the unit test runs it over src/ (and the negative fixtures in
 * tests/fixtures/v2/), the build test over dist/. Test names start with the
 * V2 ID they guard.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import postcss, { type AtRule, type ChildNode, type Container, type Root } from "postcss";
import { SaxesParser } from "saxes";

export interface V2Problem {
  id: string;
  file: string;
  message: string;
}
type Add = (id: string, message: string) => void;
const collector = (file: string): [V2Problem[], Add] => {
  const out: V2Problem[] = [];
  return [out, (id, message) => out.push({ id, file, message })];
};

/* ------------------------------------------------------------ HTML (V2-02 to V2-06, V2-11) */

/** V2-02 / V2-03: inline script, on* handlers, javascript: URLs, style attributes and <style> elements. */
export function htmlInlineProblems(file: string, html: string): V2Problem[] {
  const [out, add] = collector(file);
  for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = m[1] ?? "";
    if (!/\bsrc\s*=/.test(attrs) && !/type\s*=\s*["']?application\/ld\+json/i.test(attrs))
      add("V2-02", "inline <script> without src");
  }
  for (const m of html.matchAll(/<[a-z][\w-]*\b[^>]*?\s(on[a-z]+)\s*=/gi)) add("V2-02", `${m[1]} handler attribute`);
  if (/\b(?:href|src|action|formaction)\s*=\s*["']?\s*javascript:/i.test(html)) add("V2-02", "javascript: URL");
  if (/<[a-z][\w-]*\b[^>]*?\sstyle\s*=/i.test(html)) add("V2-03", "style attribute");
  if (/<style\b/i.test(html)) add("V2-03", "<style> element");
  return out;
}

const ABSOLUTE = /^\s*(?:[a-z][a-z0-9+.-]*:)?\/\//i;
/** V2-04: no absolute or protocol-relative asset URL and no data: URL in HTML (except outbound <a href>). */
export function htmlOriginProblems(file: string, html: string): V2Problem[] {
  const [out, add] = collector(file);
  for (const tag of html.matchAll(
    /<(script|link|img|source|iframe|embed|object|video|audio|use|image|input)\b([^>]*)>/gi,
  )) {
    for (const a of (tag[2] ?? "").matchAll(
      /\b(src|href|srcset|data|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi,
    )) {
      const v = a[2] ?? a[3] ?? a[4] ?? "";
      if (ABSOLUTE.test(v)) add("V2-04", `<${tag[1]} ${a[1]}="${v}"> loads from another origin`);
      if (/^\s*data:/i.test(v)) add("V2-04", `<${tag[1]} ${a[1]}> uses a data: URL`);
    }
  }
  // A data: URL anywhere except inside an <a> start tag (ranges, never a strip-replace).
  for (const m of html.matchAll(/\bdata:[a-z]+\/[\w.+-]+[;,]/gi)) {
    const open = html.lastIndexOf("<", m.index);
    const inTag = open >= 0 && html.indexOf(">", open) > m.index;
    if (!(inTag && /^<a\b/i.test(html.slice(open, open + 3)))) {
      add("V2-04", "data: URL in HTML");
      break;
    }
  }
  return out;
}

/** V2-04: CSS url(), @import and @font-face must be same-origin and never data:. */
export function cssOriginProblems(file: string, css: string): V2Problem[] {
  const [out, add] = collector(file);
  for (const m of css.matchAll(/url\(\s*["']?([^"')]*)/gi)) {
    const v = m[1] ?? "";
    if (ABSOLUTE.test(v) || /^\s*https?:/i.test(v)) add("V2-04", `url(${v}) is not same-origin`);
    if (/^\s*data:/i.test(v)) add("V2-04", `url(${v.slice(0, 30)}…) is a data: URL`);
  }
  for (const m of css.matchAll(/@import\s+(?:url\()?\s*["']?([^"');\s]+)/gi)) {
    if (ABSOLUTE.test(m[1] ?? "") || /^https?:/i.test(m[1] ?? "")) add("V2-04", `@import ${m[1]}`);
  }
  return out;
}

/** V2-05: no trustedTypes.createPolicy and no trusted-types directive. */
export function trustedTypesProblems(file: string, text: string): V2Problem[] {
  const [out, add] = collector(file);
  if (/trustedTypes\s*\.\s*createPolicy/.test(text)) add("V2-05", "trustedTypes.createPolicy");
  if (/(^|[;"'\s])trusted-types\s/.test(text)) add("V2-05", "trusted-types directive");
  return out;
}

const TRACKERS =
  /(google-analytics\.com|googletagmanager\.com|gtag\(|connect\.facebook\.net|facebook\.com\/tr|fbq\(|bat\.bing\.com|snap\.licdn\.com|px\.ads\.linkedin\.com|redditstatic\.com|alb\.reddit\.com|hotjar\.com|doubleclick\.net|plausible\.io|segment\.(?:io|com)|intercom|crisp\.chat|tawk\.to|drift\.com|hs-scripts\.com)/i;
/** V2-06: no iframe/embed/object, tracking pixels or analytics/ads/chat hostnames. */
export function embedProblems(file: string, text: string): V2Problem[] {
  const [out, add] = collector(file);
  for (const m of text.matchAll(/<(iframe|embed|object)\b/gi)) add("V2-06", `<${m[1]}>`);
  const t = TRACKERS.exec(text);
  if (t) add("V2-06", `tracker/embed host ${t[1]}`);
  if (/<img\b[^>]*\bwidth\s*=\s*["']?1["']?[^>]*\bheight\s*=\s*["']?1\b/i.test(text)) add("V2-06", "1×1 pixel");
  return out;
}

/** V2-11: no font loader. */
export function fontLoaderProblems(file: string, text: string): V2Problem[] {
  const [out, add] = collector(file);
  if (
    /\bnew\s+FontFace\s*\(|document\.fonts\s*\.\s*(?:add|load|delete|clear)\b|WebFont\.load|webfontloader/i.test(text)
  )
    add("V2-11", "font loader script");
  return out;
}

/** V2-11: ≤ 1 Fraunces preload per page, same-origin, crossorigin set; no other font preload. */
export function preloadProblems(file: string, html: string): V2Problem[] {
  const [out, add] = collector(file);
  const preloads = [...html.matchAll(/<link\b[^>]*\brel\s*=\s*["']?preload[^>]*>/gi)].map((m) => m[0]);
  const fonts = preloads.filter((l) => /\bas\s*=\s*["']?font/i.test(l));
  if (fonts.length > 1) add("V2-11", `${fonts.length} font preloads`);
  for (const l of fonts) {
    if (!/fraunces-latin-300/.test(l)) add("V2-11", `preload of a font other than Fraunces 300: ${l}`);
    if (!/\scrossorigin\b/.test(l)) add("V2-11", "font preload without crossorigin");
    if (/href\s*=\s*["']?(?:[a-z]+:)?\/\//i.test(l)) add("V2-11", "font preload from another origin");
  }
  return out;
}

/* ------------------------------------------------------------ fonts (V2-09, V2-10, V2-12, V2-53) */

/** V2-09: every @font-face src is a same-origin .woff2; Fraunces faces are exactly 300/400 normal; swap. */
export function fontFaceProblems(file: string, css: string, { requireFraunces = true } = {}): V2Problem[] {
  const [out, add] = collector(file);
  const fraunces: string[] = [];
  postcss.parse(css).walkAtRules(/^font-face$/i, (at) => {
    const get = (p: string) => {
      let v = "";
      at.walkDecls(new RegExp(`^${p}$`, "i"), (d) => void (v = d.value));
      return v.trim();
    };
    const family = get("font-family").replace(/^["']|["']$/g, "");
    const src = get("src");
    const urls = [...src.matchAll(/url\(\s*["']?([^"')]+)/g)].map((m) => m[1] ?? "");
    if (/ Fallback$/.test(family)) return; // local() only, checked by V1-36
    if (urls.length === 0) add("V2-09", `${family}: no url() src`);
    for (const u of urls) {
      if (!/\.woff2(?:[?#].*)?$/i.test(u)) add("V2-09", `${family}: ${u} is not a .woff2 file`);
      if (ABSOLUTE.test(u) || /^[a-z]+:/i.test(u)) add("V2-09", `${family}: ${u} is not same-origin`);
    }
    if (/format\(\s*(?!["']?woff2["']?\s*\))/i.test(src)) add("V2-09", `${family}: non-woff2 format()`);
    if (!/^swap$/i.test(get("font-display"))) add("V2-09", `${family}: font-display is not swap`);
    if (family === "Fraunces") {
      if (get("font-style") && get("font-style") !== "normal") add("V2-09", "Fraunces italic face");
      fraunces.push(get("font-weight"));
    }
  });
  if (requireFraunces && fraunces.sort().join() !== "300,400")
    add("V2-09", `Fraunces faces are [${fraunces.join(", ")}], not exactly 300 and 400`);
  return out;
}

export interface FontManifestEntry {
  file: string;
  family: string;
  sha256: string;
  licence: string;
  source: string;
}
export const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

/**
 * V2-10 / V2-53: every committed .woff2 under `dir` is in the manifest with a
 * matching sha256, and has a committed licence beside it that is the SIL OFL.
 */
export function fontFileProblems(dir: string, manifest: FontManifestEntry[]): V2Problem[] {
  const [out, add] = collector(dir);
  const woff2 = walk(dir).filter((f) => f.endsWith(".woff2"));
  if (woff2.length === 0) add("V2-53", "no committed .woff2 files");
  for (const f of woff2) {
    const rel = f.replace(/\\/g, "/");
    const entry = manifest.find((e) => e.file === rel);
    if (!entry) add("V2-53", `${rel}: not in the font hash manifest`);
    else if (entry.sha256 !== sha256(f)) add("V2-53", `${rel}: sha256 differs from the manifest`);
    const licence = join(dirname(f), "OFL.txt");
    if (!existsSync(licence)) add("V2-10", `${rel}: no committed OFL.txt beside it`);
    else if (!/SIL Open Font License/.test(readFileSync(licence, "utf8")))
      add("V2-10", `${licence} is not the SIL OFL`);
  }
  for (const e of manifest)
    if (!woff2.some((f) => f.replace(/\\/g, "/") === e.file)) add("V2-53", `${e.file}: in the manifest but missing`);
  return out;
}

/** V2-53 (dist): every built .woff2 matches a manifest hash (the build serves the committed copies). */
export function builtFontProblems(files: string[], manifest: FontManifestEntry[]): V2Problem[] {
  const [out, add] = collector("dist");
  const hashes = new Set(manifest.map((e) => e.sha256));
  const fonts = files.filter((f) => /\.(woff2?|ttf|otf|eot)$/i.test(f));
  for (const f of fonts) {
    if (!f.endsWith(".woff2")) add("V2-09", `${basename(f)} is not woff2`);
    else if (!hashes.has(sha256(f))) add("V2-53", `${basename(f)} matches no committed font hash`);
  }
  return out;
}

/** V2-12: "Fraunces Fallback" faces carry size-adjust and ascent-override, and every Fraunces stack lists it before serif. */
export function fallbackProblems(file: string, css: string): V2Problem[] {
  const [out, add] = collector(file);
  let faces = 0;
  postcss.parse(css).walkAtRules(/^font-face$/i, (at) => {
    if (!/Fraunces Fallback/.test(at.toString())) return;
    faces++;
    if (!/size-adjust\s*:/.test(at.toString())) add("V2-12", "Fraunces Fallback without size-adjust");
    if (!/ascent-override\s*:/.test(at.toString())) add("V2-12", "Fraunces Fallback without ascent-override");
  });
  if (faces === 0) add("V2-12", "no Fraunces Fallback face");
  // Font stacks only (a comma list naming Fraunces), not the @font-face family descriptors.
  for (const m of css.matchAll(/(?:font-family|--font-[\w-]+)\s*:\s*([^;]*"Fraunces"\s*,[^;]*);/g)) {
    const v = m[1] ?? "";
    const fb = v.indexOf("Fraunces Fallback");
    const serif = v.search(/\bserif\b/);
    if (fb < 0 || (serif >= 0 && fb > serif)) add("V2-12", `stack without "Fraunces Fallback" before serif: ${v}`);
  }
  return out;
}

/* ------------------------------------------------------------ amadae (V2-14) */

/** V2-14: "amadae"/"canela" outside docs/, and no canela/geist font files. */
export function referenceProblems(file: string, text?: string): V2Problem[] {
  const [out, add] = collector(file);
  if (/(^|[\\/])[^\\/]*(canela|geist)[^\\/]*\.(woff2?|ttf|otf)$/i.test(file)) add("V2-14", "Canela/Geist font file");
  if (text !== undefined && /amadae|canela/i.test(text)) add("V2-14", "reference-site name in the file");
  return out;
}

/* ------------------------------------------------------------ CSS motion (V2-16 to V2-20, V2-24, V2-25) */

const ancestors = (n: ChildNode): AtRule[] => {
  const out: AtRule[] = [];
  let p = n.parent as Container | Root | undefined;
  while (p && p.type !== "root") {
    if (p.type === "atrule") out.push(p as AtRule);
    p = p.parent as Container | undefined;
  }
  return out;
};
const inMedia = (n: ChildNode, re: RegExp) => ancestors(n).some((a) => a.name === "media" && re.test(a.params));
const NO_PREF = /prefers-reduced-motion\s*:\s*no-preference/;
const REDUCE = /prefers-reduced-motion\s*:\s*reduce/;
const SUPPORTS_VIEW = (n: ChildNode) =>
  ancestors(n).some((a) => a.name === "supports" && /animation-timeline\s*:\s*view\(\)/.test(a.params));
const LAYOUT =
  /^(all|width|height|top|left|right|bottom|margin.*|padding.*|filter|backdrop-filter|inset.*|min-.*|max-.*|font-size|line-height)$/;
const COLOUR_PROPS =
  /^(color|background-color|background|border-color|text-decoration-color|outline-color|fill|stroke)$/;
const DURATION_TOKENS = /^var\(--motion-(fast|base|slow)\)$/;
const EASE_TOKEN = /^var\(--motion-ease\)$/;

export interface MotionOptions {
  /** Token values (for built CSS where var() is already kept; values are checked literally in that case). */
  tokens?: Map<string, string>;
}

/** Split a comma list at top level. */
function splitTop(v: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of v) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * V2-16 to V2-20, V2-24, V2-25 over one stylesheet.
 *  - keyframes move only transform/opacity; translate ≤ 8 px; scale within 5 %
 *  - transitions never `all`/layout/filter; colour transitions only at 150/300 ms
 *  - every timing function var(--motion-ease) (scroll-driven: linear allowed)
 *  - every duration var(--motion-fast|base|slow) (or ≤ 500 ms literal resolving to 150/300/500);
 *    no animation-delay; no infinite; nothing over 500 ms
 *  - animation-timeline only inside @supports (view()) AND @media (no-preference)
 *  - no base rule hides .reveal (opacity 0 / visibility hidden / offset transform)
 *  - no h1 animation/transition/reveal
 *  - no blur/backdrop-filter, shimmer (background-clip:text with animation), marquee keyframes
 */
export function cssMotionProblems(file: string, css: string, opts: MotionOptions = {}): V2Problem[] {
  const [out, add] = collector(file);
  const tokens = opts.tokens ?? new Map<string, string>();
  const root = postcss.parse(css, { from: file });
  const res = (v: string): string => v.replace(/var\(\s*(--[\w-]+)\s*\)/g, (m, n: string) => tokens.get(n) ?? m).trim();
  const msOf = (v: string): number | undefined => {
    const m = /^(-?\d*\.?\d+)(ms|s)$/.exec(res(v));
    return m ? Number(m[1]) * (m[2] === "s" ? 1000 : 1) : undefined;
  };
  const okDuration = (w: string) => DURATION_TOKENS.test(w) || [150, 300, 500].includes(msOf(w) ?? -1);
  const okEase = (w: string) =>
    EASE_TOKEN.test(w) || /^cubic-bezier\(\s*0?\.4\s*,\s*0\s*,\s*0?\.2\s*,\s*1\s*\)$/.test(res(w));

  // keyframes
  root.walkAtRules(/keyframes$/i, (kf) => {
    if (/marquee|ticker|shimmer|pulse/i.test(kf.params)) add("V2-25", `@keyframes ${kf.params}`);
    kf.walkDecls((d) => {
      if (!/^(transform|opacity|animation-timing-function)$/.test(d.prop))
        add("V2-16", `@keyframes ${kf.params} animates ${d.prop}`);
      if (d.prop === "transform") {
        for (const t of d.value.matchAll(/translate[XY]?\(\s*(-?\d*\.?\d+)px(?:\s*,\s*(-?\d*\.?\d+)px)?/g)) {
          for (const n of [t[1], t[2]])
            if (n !== undefined && Math.abs(Number(n)) > 8) add("V2-18", `${kf.params}: translate ${n}px > 8px`);
        }
        for (const s of d.value.matchAll(/scale[XY]?\(\s*(-?\d*\.?\d+)/g)) {
          const v = Number(s[1]);
          if (v < 0.95 || v > 1.05) add("V2-18", `${kf.params}: scale(${v}) changes more than 5 %`);
        }
      }
    });
  });

  root.walkDecls((d) => {
    const inKf = ancestors(d).some((a) => /keyframes$/i.test(a.name));
    if (inKf) return;
    const rule = d.parent && d.parent.type === "rule" ? (d.parent as postcss.Rule) : undefined;
    const sel = rule?.selector ?? "";
    const reduce = inMedia(d, REDUCE);
    const v = d.value.replace(/\s*!important$/, "").trim();

    // V2-25 blur / backdrop
    if (/^(-webkit-)?(backdrop-)?filter$/.test(d.prop) && /blur\(/.test(v)) add("V2-25", `${sel} ${d.prop}: ${v}`);
    if (/^(-webkit-)?backdrop-filter$/.test(d.prop) && v !== "none") add("V2-25", `${sel} backdrop-filter`);
    if (/background-clip$/.test(d.prop) && /text/.test(v)) add("V2-25", `${sel}: gradient text`);

    // hover transforms (V2-18 card lift ≤ 4 px, cover scale ≤ 1.03)
    if (d.prop === "transform" && !reduce) {
      for (const t of v.matchAll(/translate[XY]?\(\s*(-?\d*\.?\d+)px/g))
        if (Math.abs(Number(t[1])) > 4 && /:hover|:focus/.test(sel))
          add("V2-18", `${sel}: hover translate ${t[1]}px > 4px`);
      for (const s of v.matchAll(/scale\(\s*(\d*\.?\d+)/g))
        if (Number(s[1]) > 1.03 && /:hover|:focus/.test(sel)) add("V2-18", `${sel}: hover scale ${s[1]} > 1.03`);
    }

    // V2-20 hidden base reveal
    if (/(^|[\s,>+~])\.reveal\b/.test(sel) && !inMedia(d, NO_PREF)) {
      if (d.prop === "opacity" && Number.parseFloat(v) < 1)
        add("V2-20", `${sel} { opacity: ${v} } outside the motion guard`);
      if (d.prop === "visibility" && v === "hidden") add("V2-20", `${sel} { visibility: hidden }`);
      if (d.prop === "transform" && v !== "none") add("V2-20", `${sel} { transform: ${v} } outside the motion guard`);
    }

    const motion = /^(animation|transition)(-|$)/.test(d.prop);
    if (!motion) return;
    if (reduce) {
      // The reset: animation none, transitions ≤ 0.01 ms.
      if (d.prop.startsWith("animation") && v !== "none") add("V2-19", `${sel}: ${d.prop} under reduced motion`);
      if (d.prop === "transition-duration" && (msOf(v) ?? 1) > 0.01)
        add("V2-19", `transition-duration ${v} under reduced motion`);
      return;
    }
    if (/^(none|0s?|0ms)$/.test(v)) return;

    // V2-24 h1
    if (
      /(^|[\s,>+~])h1\b/.test(sel) &&
      (d.prop.startsWith("animation") || /transform|opacity|all/.test(v) || d.prop === "transition")
    )
      add("V2-24", `${sel}: the h1 is animated`);

    // V2-20 timeline gating
    if (d.prop === "animation-timeline") {
      if (!SUPPORTS_VIEW(d)) add("V2-20", `${sel}: animation-timeline outside @supports (animation-timeline: view())`);
      if (!inMedia(d, NO_PREF))
        add("V2-20", `${sel}: animation-timeline outside @media (prefers-reduced-motion: no-preference)`);
      return;
    }
    if (d.prop === "animation-range" || d.prop === "animation-name" || d.prop === "animation-fill-mode") return;
    if (d.prop === "animation-delay" || d.prop === "transition-delay") {
      if ((msOf(v) ?? 0) !== 0) add("V2-17", `${sel}: ${d.prop} ${v}`);
      return;
    }
    const hasTimeline = rule?.nodes.some((n) => n.type === "decl" && n.prop === "animation-timeline") ?? false;
    if (d.prop === "animation-iteration-count") {
      if (v !== "1") add("V2-17", `${sel}: iteration count ${v}`);
      return;
    }
    if (d.prop.endsWith("-timing-function")) {
      for (const p of splitTop(v))
        if (!okEase(p) && !(p === "linear" && hasTimeline)) add("V2-17", `${sel}: easing ${p}`);
      return;
    }
    if (d.prop.endsWith("-duration")) {
      for (const p of splitTop(v)) if (!okDuration(p)) add("V2-17", `${sel}: duration ${p}`);
      return;
    }
    if (d.prop === "transition-property") {
      for (const p of splitTop(v)) if (LAYOUT.test(p)) add("V2-16", `${sel}: transition of ${p}`);
      return;
    }
    // shorthands
    for (const part of splitTop(v)) {
      const words = part.split(/\s+(?![^(]*\))/).filter(Boolean);
      const times = words.filter((w) => msOf(w) !== undefined || DURATION_TOKENS.test(w));
      const eases = words.filter((w) =>
        /^(linear|ease|ease-in|ease-out|ease-in-out|cubic-bezier\(.*\)|steps\(.*\)|var\(--motion-ease\))$/.test(w),
      );
      if (/infinite/.test(part)) add("V2-17", `${sel}: infinite`);
      if (times.length > 1) add("V2-17", `${sel}: ${d.prop} with a delay (${part})`);
      for (const t of times) if (!okDuration(t)) add("V2-17", `${sel}: duration ${t}`);
      if (times.length === 0 && !hasTimeline) add("V2-17", `${sel}: ${d.prop} without a motion duration token`);
      for (const e of eases) if (!okEase(e) && !(e === "linear" && hasTimeline)) add("V2-17", `${sel}: easing ${e}`);
      if (d.prop === "transition") {
        const prop = words.find((w) => !times.includes(w) && !eases.includes(w)) ?? "all";
        if (LAYOUT.test(prop)) add("V2-16", `${sel}: transition of ${prop}`);
        if (COLOUR_PROPS.test(prop) && !times.every((t) => /fast|base/.test(t) || [150, 300].includes(msOf(t) ?? -1)))
          add("V2-16", `${sel}: colour transition not 150/300 ms`);
      }
    }
  });
  return out;
}

/* ------------------------------------------------------------ focus and nav (V2-29, V2-31) */

/** V2-29: `outline: none`/`0` without a replacement outline or box-shadow ring in the same rule. */
export function outlineRemovalProblems(file: string, css: string): V2Problem[] {
  const [out, add] = collector(file);
  postcss.parse(css).walkRules((r) => {
    const decls = r.nodes.filter((n) => n.type === "decl") as postcss.Declaration[];
    const removes = decls.some(
      (d) => (d.prop === "outline" || d.prop === "outline-style") && /^(none|0)\b/.test(d.value),
    );
    if (!removes) return;
    const replaced = decls.some((d) => d.prop === "box-shadow" && d.value !== "none");
    if (!replaced) add("V2-29", `${r.selector}: outline removed without a replacement`);
  });
  return out;
}

/** V2-31: the header background alpha ≥ 0.92 and no backdrop-filter on it. Tokens resolve var(). */
export function navOpacityProblems(file: string, css: string, tokens = new Map<string, string>()): V2Problem[] {
  const [out, add] = collector(file);
  let seen = 0;
  postcss.parse(css).walkRules((r) => {
    if (!/\.site-header\b(?!\s*\.)/.test(r.selector) || /::?after|::?before/.test(r.selector)) return;
    r.walkDecls((d) => {
      if (/backdrop-filter$/.test(d.prop) && d.value !== "none") add("V2-31", `${r.selector}: backdrop-filter`);
      if (!/^background(-color)?$/.test(d.prop)) return;
      seen++;
      const v = d.value.replace(/var\(\s*(--[\w-]+)\s*\)/g, (m, n: string) => tokens.get(n) ?? m);
      const a =
        /\/\s*(\d*\.?\d+)(%?)\s*\)/.exec(v) ??
        /rgba\([^)]*,\s*(\d*\.?\d+)(%?)\s*\)/.exec(v) ??
        /#[0-9a-f]{6}([0-9a-f]{2})\b/i.exec(v);
      let alpha = 1;
      if (a && a[0].startsWith("#")) alpha = parseInt(a[1] ?? "ff", 16) / 255;
      else if (a) alpha = Number(a[1]) / (a[2] === "%" ? 100 : 1);
      if (/transparent/.test(v)) alpha = 0;
      if (alpha < 0.92) add("V2-31", `${r.selector}: background alpha ${alpha} < 0.92`);
    });
  });
  if (seen === 0 && file.startsWith("src/")) add("V2-31", "no .site-header background found");
  return out;
}

/* ------------------------------------------------------------ SVG (V2-36 to V2-39, V2-54 to V2-56) */

/** The V2 SVG rules (Aegis), each with its own ID; runs with a real XML parser. */
export function svgV2Problems(file: string, markup: string): V2Problem[] {
  const [out, add] = collector(file);
  const parser = new SaxesParser({ xmlns: false });
  parser.on("opentag", (tag) => {
    const name = tag.name.toLowerCase();
    const attrs = tag.attributes as Record<string, string>;
    if (name === "script") add("V2-36", "<script> in SVG");
    if (name === "foreignobject") add("V2-38", "<foreignObject> in SVG");
    for (const [k, raw] of Object.entries(attrs)) {
      const n = k.toLowerCase();
      const v = String(raw).trim();
      if (n.startsWith("on")) add("V2-37", `${k} handler`);
      if (n === "href" || n === "xlink:href") {
        if (name === "a") {
          if (!v.startsWith("#") && !/^https:\/\//i.test(v)) add("V2-54", `<a ${k}="${v}">: only https: or #fragment`);
        } else if (name === "use") {
          if (!/^#[A-Za-z][\w.-]*$/.test(v)) add("V2-56", `<use ${k}="${v}"> points outside the file`);
        } else if (!/^#[A-Za-z][\w.-]*$/.test(v))
          add(n === "href" ? "V2-39" : "V2-39", `<${tag.name} ${k}="${v}"> is not a #fragment`);
        if (n === "xlink:href" && !v.startsWith("#") && name !== "a" && name !== "use") add("V2-39", `xlink:href ${v}`);
      }
      if (
        (name === "animate" || name === "set" || name === "animatetransform") &&
        n === "attributename" &&
        /^(xlink:)?href$/i.test(v)
      )
        add("V2-55", `<${tag.name} attributeName="${v}">`);
      for (const m of v.matchAll(/url\(\s*["']?([^"')]*)/gi))
        if (!(m[1] ?? "").startsWith("#")) add("V2-39", `url(${m[1]}) is not url(#id)`);
    }
  });
  parser.on("text", (t) => {
    for (const m of t.matchAll(/url\(\s*["']?([^"')]*)/gi))
      if (!(m[1] ?? "").startsWith("#")) add("V2-39", `url(${m[1]}) in <style>`);
  });
  parser.on("error", () => void 0);
  try {
    parser.write(markup).close();
  } catch {
    // reported through "error"; the remaining rules still ran on what parsed
  }
  return out;
}

/* ------------------------------------------------------------ visual config (V2-45) */

/** V2-45: the visual Playwright config sets use.reducedMotion 'reduce' and keeps animations 'disabled'. */
export function visualConfigProblems(file: string, text: string): V2Problem[] {
  const [out, add] = collector(file);
  const use = /\buse:\s*\{([^}]*)\}/.exec(text)?.[1] ?? "";
  if (!/reducedMotion:\s*["']reduce["']/.test(use)) add("V2-45", "use.reducedMotion is not 'reduce'");
  if (!/animations:\s*["']disabled["']/.test(text)) add("V2-45", "toHaveScreenshot animations is not 'disabled'");
  return out;
}

export const ids = (ps: V2Problem[]) => [...new Set(ps.map((p) => p.id))];
