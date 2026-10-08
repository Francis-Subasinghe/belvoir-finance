/**
 * V1 E2E measurements, run in the page (tests/e2e/v1-visual.spec.ts). Each
 * returns a list of problems (empty when the rule holds) so the negative checks
 * can assert the same function catches the F3 CSS.
 */
import type { Page } from "@playwright/test";

/** V1-25: no animation or transition anywhere (elements and ::before/::after). */
export function reducedMotionProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const zero = (v: string) => v.split(",").every((d) => parseFloat(d) === 0);
    for (const el of document.querySelectorAll("*")) {
      for (const pseudo of [null, "::before", "::after"]) {
        const cs = getComputedStyle(el, pseudo);
        const name = `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}${pseudo ?? ""}`;
        if (cs.animationName !== "none" && !zero(cs.animationDuration))
          out.push(`animation ${cs.animationName}: ${name}`);
        if (!zero(cs.transitionDuration)) out.push(`transition ${cs.transitionDuration}: ${name}`);
      }
    }
    const running = document.getAnimations();
    for (const a of running) out.push(`running ${(a as CSSAnimation).animationName ?? a.constructor.name}`);
    return out;
  });
}

/**
 * V1-26: every text, image and SVG element is fully visible: it and every
 * ancestor compute opacity 1 and visibility visible, with no transform
 * pushing it out of place (only the 4 px card lift is allowed).
 */
export function hiddenContentProblems(page: Page, onlyBelowFold = false): Promise<string[]> {
  return page.evaluate((below) => {
    const out: string[] = [];
    const fold = window.innerHeight;
    const visible = (el: Element): string | null => {
      // A disabled control is dimmed on purpose (F2 disabled state), not hidden by motion.
      if (el.closest(":disabled, [aria-disabled='true']")) return "";
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === "none") return null; // not rendered at all (e.g. sr-only patterns use clip, not this)
        if (parseFloat(cs.opacity) < 1)
          return `opacity ${cs.opacity} on ${e.tagName.toLowerCase()}.${[...e.classList].join(".")}`;
        if (cs.visibility === "hidden") return `visibility hidden on ${e.tagName.toLowerCase()}`;
        if (cs.transform !== "none") {
          const m = new DOMMatrixReadOnly(cs.transform);
          if (Math.abs(m.m41) > 0.5 || Math.abs(m.m42) > 4.5 || Math.abs(m.a - 1) > 1e-3 || Math.abs(m.d - 1) > 1e-3)
            return `transform ${cs.transform} on ${e.tagName.toLowerCase()}.${[...e.classList].join(".")}`;
        }
      }
      return "";
    };
    const targets = [...document.querySelectorAll("body *")].filter(
      (e) =>
        e instanceof SVGSVGElement ||
        e.tagName === "IMG" ||
        [...e.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== ""),
    );
    for (const el of targets) {
      if (el.closest("svg") && !(el instanceof SVGSVGElement)) continue; // the svg itself is checked
      if (below && el.getBoundingClientRect().top < fold) continue;
      const why = visible(el);
      if (why) out.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 30)}": ${why}`);
    }
    return out;
  }, onlyBelowFold);
}

/** Install before navigation: samples each element's effective opacity after first paint. */
export async function installOpacitySampler(page: Page, times: number[]): Promise<void> {
  await page.addInitScript((ts: number[]) => {
    const w = window as unknown as { __samples: number[][]; __sampleLabels: string[] };
    w.__samples = [];
    w.__sampleLabels = [];
    const sample = () => {
      const els = [...document.querySelectorAll("body *")];
      const eff = new Map<Element, number>();
      const row: number[] = [];
      for (const el of els) {
        const parent = el.parentElement;
        const o = parseFloat(getComputedStyle(el).opacity) * (parent ? (eff.get(parent) ?? 1) : 1);
        eff.set(el, o);
        row.push(o);
      }
      if (w.__sampleLabels.length === 0)
        w.__sampleLabels = els.map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join(".")}`);
      w.__samples.push(row);
    };
    // First paint: the first animation frame after the body exists.
    const start = () =>
      requestAnimationFrame(() => {
        const t0 = performance.now();
        for (const t of ts) setTimeout(sample, Math.max(0, t - (performance.now() - t0)));
      });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }, times);
}

/** V1-57: no element's effective opacity drops between samples. */
export async function opacityDrops(page: Page, sampleCount: number): Promise<{ drops: string[]; animated: number }> {
  await page.waitForFunction(
    (n) => (window as unknown as { __samples: number[][] }).__samples.length >= n,
    sampleCount,
  );
  return page.evaluate(() => {
    const w = window as unknown as { __samples: number[][]; __sampleLabels: string[] };
    const drops: string[] = [];
    let animated = 0;
    const n = Math.min(...w.__samples.map((r) => r.length));
    for (let i = 0; i < n; i++) {
      const series = w.__samples.map((r) => r[i] ?? 1);
      if (series.some((v) => v < 0.999)) animated++;
      for (let k = 1; k < series.length; k++) {
        if ((series[k] ?? 1) < (series[k - 1] ?? 1) - 1e-3) {
          drops.push(`${w.__sampleLabels[i]}: ${series.map((v) => v.toFixed(2)).join(" -> ")}`);
          break;
        }
      }
    }
    return { drops, animated };
  });
}

/** V1-29: the element and its ancestors are not animated (name none, nothing running). */
export function animatedAncestry(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll(sel)) {
      for (let e: Element | null = el; e; e = e.parentElement) {
        const name = getComputedStyle(e).animationName;
        const running = e.getAnimations({ subtree: false }).length;
        if (name !== "none" || running > 0)
          out.push(`${sel} → ${e.tagName.toLowerCase()}.${[...e.classList].join(".")}: ${name} (${running} running)`);
      }
    }
    return out;
  }, selector);
}

/** V1-21: at the centre of each match, elementFromPoint is the element or a descendant. */
export function coveredProblems(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll(sel)) {
      el.scrollIntoView({ block: "center" });
      // A wrapped inline (the byline flag) has several fragments; its bounding box
      // centre can fall between them, so test the centre of the first fragment.
      const r = el.getClientRects()[0] ?? el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) {
        out.push(`${sel}: not rendered`);
        continue;
      }
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      if (!hit || !el.contains(hit))
        out.push(`${sel} "${(el.textContent ?? "").trim().slice(0, 30)}": covered by ${hit?.tagName}`);
    }
    window.scrollTo(0, 0);
    return out;
  }, selector);
}

/**
 * V1-58: every text line box of each match lies inside the element's padding
 * box with its rounded corners (border-radius scaled as CSS does when the radii
 * overflow the box).
 */
export function textOutsidePillProblems(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll(sel)) {
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      const bl = parseFloat(cs.borderLeftWidth);
      const bt = parseFloat(cs.borderTopWidth);
      const left = b.left + bl;
      const top = b.top + bt;
      const w = b.width - bl - parseFloat(cs.borderRightWidth);
      const h = b.height - bt - parseFloat(cs.borderBottomWidth);
      // Outer radius scaled per CSS Backgrounds 5.5, then the inner (padding-edge) radius.
      const r = parseFloat(cs.borderTopLeftRadius);
      const f = Math.min(1, b.width / (2 * r || 1), b.height / (2 * r || 1));
      const ri = Math.max(0, r * f - Math.max(bl, bt));
      const inside = (x: number, y: number) => {
        const eps = 0.5;
        if (x < left - eps || x > left + w + eps || y < top - eps || y > top + h + eps) return false;
        const cx = Math.min(Math.max(x, left + ri), left + w - ri);
        const cy = Math.min(Math.max(y, top + ri), top + h - ri);
        return Math.hypot(x - cx, y - cy) <= ri + eps;
      };
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let lines = 0;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const q of range.getClientRects()) {
          if (q.width === 0) continue;
          lines++;
          for (const [x, y] of [
            [q.left, q.top],
            [q.right, q.top],
            [q.left, q.bottom],
            [q.right, q.bottom],
          ] as const) {
            if (!inside(x, y)) {
              out.push(
                `${sel} line ${lines} corner (${(x - left).toFixed(1)}, ${(y - top).toFixed(1)}) outside a ${w.toFixed(0)}×${h.toFixed(0)} box with radius ${ri.toFixed(1)}`,
              );
              break;
            }
          }
        }
      }
      if (lines < 2) out.push(`${sel}: expected the long label to wrap (${lines} line)`);
    }
    return out;
  }, selector);
}

/** V1-59: neighbouring pills in one container are at least `min` px apart. */
export function pillGapProblems(page: Page, container: string, pills: string, min = 4): Promise<string[]> {
  return page.evaluate(
    ([c, p, m]) => {
      const out: string[] = [];
      for (const box of document.querySelectorAll(c)) {
        const list = [...box.querySelectorAll(p)].map((e) => e.getBoundingClientRect());
        for (let i = 1; i < list.length; i++) {
          const a = list[i - 1];
          const b = list[i];
          if (!a || !b) continue;
          const sameRow = a.bottom > b.top + 1 && b.bottom > a.top + 1;
          const gap = sameRow ? b.left - a.right : b.top - a.bottom;
          if (gap < m)
            out.push(
              `${c}: ${sameRow ? "horizontal" : "vertical"} gap ${gap.toFixed(1)} px between pills ${i} and ${i + 1}`,
            );
        }
      }
      return out;
    },
    [container, pills, min] as const,
  );
}

/** V1-60: vertical gap from the bottom of `upper` to the top of `lower`. */
export function verticalGap(page: Page, upper: string, lower: string): Promise<number> {
  return page.evaluate(
    ([u, l]) => {
      const upperEl = document.querySelector(u);
      const lowerEl = document.querySelector(l);
      if (!upperEl || !lowerEl) return Number.NaN;
      return lowerEl.getBoundingClientRect().top - upperEl.getBoundingClientRect().bottom;
    },
    [upper, lower] as const,
  );
}

/** V1-61: each matching label renders as one line box (one client rect for its text). */
export function wrappedLabelProblems(page: Page, selector: string, text: string): Promise<string[]> {
  return page.evaluate(
    ([sel, t]) => {
      const out: string[] = [];
      const els = [...document.querySelectorAll(sel)].filter((e) => (e.textContent ?? "").trim() === t);
      if (els.length === 0) out.push(`no ${sel} "${t}"`);
      for (const el of els) {
        const range = document.createRange();
        range.selectNodeContents(el);
        // The <dt> itself is a stretched flex item, so measure its text, not its box.
        const rects = [...range.getClientRects()].filter((r) => r.width > 0);
        const lh = parseFloat(getComputedStyle(el).lineHeight);
        const h = Math.max(0, ...rects.map((r) => r.bottom)) - Math.min(...rects.map((r) => r.top));
        if (rects.length !== 1 || h > lh * 1.5)
          out.push(`"${t}" renders as ${rects.length} rects, ${h.toFixed(0)} px tall (line ${lh.toFixed(0)} px)`);
      }
      return out;
    },
    [selector, text] as const,
  );
}
