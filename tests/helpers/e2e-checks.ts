/**
 * In-page checks shared by the F2 E2E specs. Each function runs in the
 * browser via page.evaluate and returns a list of offenders (empty = pass).
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export async function axeProblems(page: Page): Promise<{ bad: string[]; region: string[] }> {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const bad = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
  const region = results.violations.filter((v) => v.id === "region").map((v) => `${v.nodes.length} node(s)`);
  return { bad, region };
}

export function collectCspErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /Content Security Policy/i.test(m.text())) errors.push(m.text());
  });
  return errors;
}

/** F2-09: gold only over navy/slate; #7E6026 text/outline only over a light background. */
export function renderedGoldProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const GOLD = "rgb(197, 160, 89)";
    const GOLD_ON_LIGHT = "rgb(126, 96, 38)";
    const DARK = new Set(["rgb(11, 19, 43)", "rgb(28, 37, 65)"]);
    const opaqueBg = (el: Element): string => {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const c = getComputedStyle(e).backgroundColor;
        if (/^rgb\(/.test(c)) return c;
        const a = /^rgba\([^)]*,\s*([\d.]+)\)$/.exec(c);
        if (a && Number(a[1]) >= 1) return c;
      }
      return "rgb(255, 255, 255)";
    };
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}.${[...el.classList].join(".")} "${(el.textContent ?? "").trim().slice(0, 30)}"`;
    const out: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const props: string[] = [cs.color, cs.backgroundColor, cs.fill, cs.stroke];
      for (const side of ["top", "right", "bottom", "left"]) {
        if (parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0)
          props.push(cs.getPropertyValue(`border-${side}-color`));
      }
      const bg = opaqueBg(el);
      // An outline is drawn outside the box (with an offset), so it sits on the parent's background.
      const hasOutline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
      const outlineBg = el.parentElement ? opaqueBg(el.parentElement) : bg;
      if (props.includes(GOLD) && !DARK.has(bg)) out.push(`gold on ${bg}: ${describe(el)}`);
      if (hasOutline && cs.outlineColor === GOLD && !DARK.has(outlineBg))
        out.push(`gold outline on ${outlineBg}: ${describe(el)}`);
      if (cs.color === GOLD_ON_LIGHT && DARK.has(bg)) out.push(`#7E6026 text on ${bg}: ${describe(el)}`);
      if (hasOutline && cs.outlineColor === GOLD_ON_LIGHT && DARK.has(outlineBg)) {
        out.push(`#7E6026 outline on ${outlineBg}: ${describe(el)}`);
      }
    }
    return out;
  });
}

/** F2-18: no page-level horizontal scroll and nothing past the viewport except in a named, focusable scroll region. */
export function overflowProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > window.innerWidth) {
      out.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
    }
    for (const el of document.querySelectorAll("body *")) {
      if (el.closest(".visually-hidden, .skip-link")) continue;
      // Shapes inside an <svg> are clipped to the svg's viewport (UA overflow: hidden),
      // so they can't scroll the page; cover art with preserveAspectRatio "slice" draws
      // past its box on purpose. The <svg> element itself is still checked.
      if (el.tagName.toLowerCase() !== "svg" && el.closest("svg")) continue;
      const scroller = el.closest(".table-scroll");
      if (scroller && scroller !== el) {
        if (scroller.getAttribute("tabindex") !== "0" || !scroller.getAttribute("aria-label")) {
          out.push("scroll region not focusable or unnamed");
        }
        continue;
      }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > vw + 1 || r.left < -1) {
        out.push(
          `${el.tagName.toLowerCase()}.${[...el.classList].join(".")} spans ${Math.round(r.left)}..${Math.round(r.right)} (viewport ${vw})`,
        );
      }
    }
    return out;
  });
}

/** F2-19: interactive targets at least 24x24 CSS px; inline links in running text are exempt. */
export function targetSizeProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const sel = 'a[href], button, input, select, textarea, [tabindex="0"]';
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      if (el.closest(".skip-link") || el.classList.contains("skip-link")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (el.tagName === "A") {
        const parent = el.parentElement;
        const own = (el.textContent ?? "").trim();
        const ctx = (parent?.textContent ?? "").trim();
        if (getComputedStyle(el).display === "inline" && ctx.length > own.length) continue; // inline in prose
      }
      if (r.width < 23.5 || r.height < 23.5) {
        out.push(
          `${el.tagName.toLowerCase()}#${el.id} "${(el.textContent ?? "").trim().slice(0, 30)}" ${r.width.toFixed(1)}x${r.height.toFixed(1)}`,
        );
      }
    }
    return out;
  });
}

/** F2-13: serif headings, sans body/nav/forms, mono figures. */
export function fontProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const starts = (el: Element, family: string) =>
      getComputedStyle(el).fontFamily.replace(/"/g, "").startsWith(family);
    for (const el of document.querySelectorAll("h1, h2, h3, h4, .story-card-title, .article-title")) {
      if (!starts(el, "Source Serif 4"))
        out.push(`heading not serif: ${el.tagName} ${getComputedStyle(el).fontFamily}`);
    }
    for (const el of document.querySelectorAll(
      "body, p, .site-nav a, label, input:not([data-numeric]):not([type=checkbox]), select, button",
    )) {
      if (el.closest("[data-numeric], h1, h2, h3, h4")) continue;
      if (!starts(el, "Inter"))
        out.push(`text not sans: ${el.tagName}.${[...el.classList].join(".")} ${getComputedStyle(el).fontFamily}`);
    }
    for (const el of document.querySelectorAll("[data-numeric]")) {
      if (!starts(el, "IBM Plex Mono")) out.push(`figure not mono: ${el.tagName} ${getComputedStyle(el).fontFamily}`);
    }
    return out;
  });
}

/** F2-14: every [data-numeric] computes tabular numerals. */
export function numericProblems(page: Page): Promise<{ count: number; bad: string[] }> {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll("[data-numeric]")];
    const bad = els
      .filter((el) => !getComputedStyle(el).fontVariantNumeric.includes("tabular-nums"))
      .map((el) => `${el.tagName} "${(el.textContent ?? "").trim()}"`);
    return { count: els.length, bad };
  });
}

/** F2-16: nothing clipped (overflow hidden/clip with content larger than its box). */
export function clippingProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      if (el.closest(".visually-hidden") || el.closest(".table-scroll")) continue;
      const cs = getComputedStyle(el);
      const clipsX = ["hidden", "clip"].includes(cs.overflowX);
      const clipsY = ["hidden", "clip"].includes(cs.overflowY);
      if (clipsX && el.scrollWidth > el.clientWidth + 1) out.push(`x-clipped: ${el.tagName}.${el.className}`);
      if (clipsY && el.scrollHeight > el.clientHeight + 1) out.push(`y-clipped: ${el.tagName}.${el.className}`);
      if (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "BUTTON") {
        if (el.scrollHeight > el.clientHeight + 2) out.push(`control text clipped: ${el.tagName}#${el.id}`);
      }
    }
    if (document.documentElement.scrollWidth > window.innerWidth) out.push("page overflows horizontally");
    return out;
  });
}

export const TEXT_SPACING_CSS = `* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
p { margin-bottom: 2em !important; }`;

export interface FocusStop {
  tag: string;
  id: string;
  text: string;
  top: number;
  left: number;
  outlineWidth: number;
  outlineStyle: string;
  contrast: number;
  obscured: boolean;
  inFooter: boolean;
}

/** Read the focused element's indicator, its contrast against the adjacent background and whether it's obscured. */
export function focusStop(page: Page): Promise<FocusStop | null> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return null;
    const parse = (c: string) => (/\d+(\.\d+)?/g[Symbol.match](c) ?? []).map(Number).slice(0, 3);
    const lum = ([r, g, b]: number[]) => {
      const ch = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(r ?? 0) + 0.7152 * ch(g ?? 0) + 0.0722 * ch(b ?? 0);
    };
    const opaqueBg = (start: Element | null): string => {
      for (let e = start; e; e = e.parentElement) {
        const c = getComputedStyle(e).backgroundColor;
        if (/^rgb\(/.test(c)) return c;
      }
      return "rgb(255, 255, 255)";
    };
    const cs = getComputedStyle(el);
    // The outline is drawn outside the box (offset), so the adjacent colour is the parent's background.
    const bg = opaqueBg(el.parentElement);
    const [a, b] = [lum(parse(cs.outlineColor)), lum(parse(bg))].sort((x, y) => y - x) as [number, number];
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id,
      text: (el.textContent ?? "").trim().slice(0, 30),
      top: r.top + window.scrollY,
      left: r.left + window.scrollX,
      outlineWidth: parseFloat(cs.outlineWidth),
      outlineStyle: cs.outlineStyle,
      contrast: (a + 0.05) / (b + 0.05),
      obscured: !(hit && (hit === el || el.contains(hit))),
      inFooter: !!el.closest("footer"),
    };
  });
}
