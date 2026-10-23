/**
 * V2 visual/UX redesign, E2E (docs/qa/AC_V2_DESIGN.md v0.2): runtime CSP
 * (V2-07), reduced motion (V2-19, V2-23), the Firefox static default (V2-21),
 * JS off (V2-22, V2-34), the unanimated H1 (V2-24), the two-tone focus ring
 * (V2-29, V2-30), the opaque nav (V2-31), keyboard order (V2-33) and targets
 * and reflow (V2-35). The font-delay CLS guard (V2-13) is layout-shift.spec.ts,
 * which holds every font response on every page, /cookies/ at 360 included.
 */
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { sitePaths } from "../helpers/e2e-pages";

const PAGES = sitePaths();
const STORY = "stories/why-profit-isnt-cash/";
const projectWidth = () => test.info().project.use.viewport?.width ?? 0;

async function scrollThrough(page: Page) {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight / 2));
    for (let y = 0; y <= document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
  });
}

/** Every .reveal at opacity 1 and transform none once scrolled into view. */
function revealProblems(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const out: string[] = [];
    for (const el of document.querySelectorAll(".reveal")) {
      el.scrollIntoView({ block: "center" });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
      const running = el.getAnimations().filter((a) => a.playState === "running" && !(a instanceof CSSTransition));
      if (running.length > 0) {
        // Scroll-driven reveals are allowed to run where supported; they must end visible.
        for (const a of running) a.finish?.();
      }
      const cs = getComputedStyle(el);
      if (cs.opacity !== "1" || cs.transform !== "none")
        out.push(`${el.className}: opacity ${cs.opacity}, transform ${cs.transform}`);
      if (el.classList.contains("is-hidden")) out.push(`${el.className}: is-hidden`);
    }
    return out;
  });
}

test.describe("V2-07 no CSP violations at runtime", () => {
  for (const path of PAGES) {
    test(`V2-07 /${path}`, async ({ page }) => {
      test.skip(projectWidth() !== 1280, "AC: listener at 1280");
      const console: string[] = [];
      page.on("console", (m) => {
        if (/Content.Security.Policy|CSP/i.test(m.text())) console.push(m.text());
      });
      await page.addInitScript(() => {
        const w = window as unknown as { __csp: string[] };
        w.__csp = [];
        document.addEventListener("securitypolicyviolation", (e) =>
          w.__csp.push(`${e.violatedDirective} ${e.blockedURI}`),
        );
      });
      await page.goto(path);
      await page.waitForLoadState("load");
      await scrollThrough(page);
      expect(await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)).toEqual([]);
      expect(console).toEqual([]);
    });
  }
});

test.describe("V2-19 / V2-23 reduced motion: nothing animates, everything visible", () => {
  test.use({ reducedMotion: "reduce" });
  for (const path of PAGES) {
    test(`V2-19 / V2-23 /${path}`, async ({ page }) => {
      test.skip(projectWidth() === 768, "AC: 360 and 1280");
      await page.goto(path);
      // V2-23: visible immediately on load.
      const atLoad = await page.evaluate(() =>
        [...document.querySelectorAll(".reveal")]
          .map((e) => [e.className, getComputedStyle(e).opacity, getComputedStyle(e).transform])
          .filter(([, o, t]) => o !== "1" || t !== "none"),
      );
      expect(atLoad).toEqual([]);
      await scrollThrough(page);
      const card = page.locator(".story-card").first();
      if ((await card.count()) > 0) {
        await card.hover();
        const link = card.locator("a").first();
        await link.focus();
      }
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
      const style = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
      expect(style).toBe("auto");
      const slow = await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .map((e) => getComputedStyle(e).transitionDuration)
          .filter((d) => d.split(",").some((x) => parseFloat(x) * (x.trim().endsWith("ms") ? 1 : 1000) > 0.01)),
      );
      expect(slow).toEqual([]);
      expect(await revealProblems(page)).toEqual([]);
    });
  }
});

test.describe("V2-21 static by default where animation-timeline is unsupported (Firefox)", () => {
  for (const path of PAGES) {
    test(`V2-21 /${path}`, async ({ page, browserName }) => {
      test.skip(browserName !== "firefox", "V2-21 runs in the Firefox project (PR #48)");
      test.skip(projectWidth() === 768, "AC: 360 and 1280");
      await page.goto(path);
      const supported = await page.evaluate(() => CSS.supports("animation-timeline: view()"));
      test.skip(supported, "this Firefox supports animation-timeline; the @supports fixture covers it");
      expect(await revealProblems(page)).toEqual([]);
      const anims = await page.evaluate(
        () => document.getAnimations().filter((a) => !(a instanceof CSSTransition) && a.playState === "running").length,
      );
      // The hero load stagger is ≤ 500 ms; wait it out, then nothing may run.
      await page.waitForTimeout(600);
      expect(
        await page.evaluate(
          () =>
            document.getAnimations().filter((a) => !(a instanceof CSSTransition) && a.playState === "running").length,
        ),
        `running at load: ${anims}`,
      ).toBe(0);
    });
  }
});

test.describe("V2-22 / V2-34 JS off", () => {
  test.use({ javaScriptEnabled: false });
  for (const path of PAGES) {
    test(`V2-22 /${path}: every reveal ends visible`, async ({ page }) => {
      test.skip(projectWidth() === 768, "covered at 360 and 1280");
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("h1")).toHaveCount(1);
      // No script: scroll with the keyboard-free API (page.mouse.wheel) and read styles.
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < height; y += 400) await page.mouse.wheel(0, 400);
      const bad = await page
        .locator(".reveal")
        .evaluateAll((els) =>
          els
            .map((e) => [e.className, getComputedStyle(e).opacity, e.classList.contains("is-hidden")] as const)
            .filter(([, o, h]) => o !== "1" || h),
        );
      expect(bad).toEqual([]);
    });
  }

  test("V2-34 the tool's pre-rendered worked example is present with JS off", async ({ page }) => {
    await page.goto("tools/cash-vs-profit/");
    await expect(page.locator("main")).toContainText(/worked example/i);
  });
});

test.describe("V2-24 the H1 is never animated", () => {
  test.use({ reducedMotion: "no-preference" });
  for (const path of PAGES) {
    test(`V2-24 /${path}`, async ({ page }) => {
      await page.goto(path);
      const h1 = await page.evaluate(() => {
        const h = document.querySelector("h1");
        if (!h) return null;
        let anims = 0;
        for (let e: Element | null = h; e; e = e.parentElement) anims += e.getAnimations().length;
        const cs = getComputedStyle(h);
        return {
          anims,
          opacity: cs.opacity,
          animation: cs.animationName,
          // Only transitions that actually take time count (the initial value is "all 0s").
          transition: cs.transitionProperty
            .split(",")
            .map((prop, i) => [prop.trim(), cs.transitionDuration.split(",")[i] ?? "0s"])
            .filter(([, d]) => parseFloat(d ?? "0") > 0)
            .map(([prop]) => prop)
            .join(","),
          reveal: h.closest(".reveal") !== null,
        };
      });
      expect(h1).not.toBeNull();
      expect(h1).toEqual({
        anims: 0,
        opacity: "1",
        animation: "none",
        transition: expect.not.stringMatching(/opacity|transform|all/) as unknown as string,
        reveal: false,
      });
    });
  }
});

/** Parse an rgb()/rgba() colour. */
type Rgb = [number, number, number, number];

test.describe("V2-29 / V2-30 two-tone focus ring on every focus stop", () => {
  for (const path of PAGES) {
    test(`V2-29 / V2-30 /${path}`, async ({ page }) => {
      test.skip(projectWidth() !== 1280, "focus styles are width-independent; run at 1280");
      await page.goto(path);
      const problems: string[] = [];
      for (let i = 0; i < 80; i++) {
        await page.keyboard.press("Tab");
        const r = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const parse = (c: string): Rgb | null => {
            const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c);
            return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null;
          };
          const bgOf = (start: Element | null): Rgb => {
            for (let e = start; e; e = e.parentElement) {
              const c = parse(getComputedStyle(e).backgroundColor);
              if (c && c[3] >= 0.92) return c;
            }
            return [251, 251, 249, 1];
          };
          const lum = ([r, g, b]: Rgb) => {
            const f = (v: number) => {
              const s = v / 255;
              return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            };
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
          };
          const ratio = (a: Rgb, b: Rgb) => {
            const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
            return (x + 0.05) / (y + 0.05);
          };
          const cs = getComputedStyle(el);
          const outline = parse(cs.outlineColor);
          const inner = parse(cs.boxShadow.split(/\)\s/)[0] + ")");
          const own = bgOf(el);
          const behind = bgOf(el.parentElement);
          const best = (s: Rgb) =>
            Math.max(outline ? ratio(outline, s) : 0, inner && cs.boxShadow !== "none" ? ratio(inner, s) : 0);
          return {
            id: `${el.tagName.toLowerCase()} "${(el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 30)}"`,
            style: cs.outlineStyle,
            width: parseFloat(cs.outlineWidth),
            shadow: cs.boxShadow,
            own: best(own),
            behind: best(behind),
          };
        });
        if (r === null) break;
        if (r.style === "none" || r.width < 3) problems.push(`${r.id}: outline ${r.style} ${r.width}px`);
        if (!/ 0px 0px 0px 2px/.test(r.shadow) && !/0px 0px 0px 2px/.test(r.shadow))
          problems.push(`${r.id}: no 2px inner ring (${r.shadow})`);
        if (r.own < 3 || r.behind < 3)
          problems.push(`${r.id}: ring contrast ${r.own.toFixed(2)}/${r.behind.toFixed(2)}`);
      }
      expect(problems).toEqual([]);
    });
  }
});

test.describe("V2-31 the sticky nav is ≥ 92% opaque", () => {
  for (const path of ["./", STORY]) {
    test(`V2-31 /${path} at rest and stuck`, async ({ page }) => {
      await page.goto(path);
      const read = () =>
        page.evaluate(() => {
          const h = document.querySelector(".site-header") as HTMLElement;
          const alpha = (c: string) => {
            const m = /rgba?\([^)]*?(?:,\s*|\/\s*)([\d.]+)\)$/.exec(c);
            return c === "transparent" ? 0 : m && /rgba|\//.test(c) ? Number(m[1]) : 1;
          };
          const cs = getComputedStyle(h);
          const before = getComputedStyle(h, "::before");
          return {
            bg: alpha(cs.backgroundColor),
            before: before.content === "none" ? 1 : Math.max(alpha(before.backgroundColor), 0),
            filter: cs.backdropFilter ?? "none",
            height: h.getBoundingClientRect().height,
          };
        });
      const top = await read();
      await page.evaluate(() => window.scrollTo(0, 2000));
      await page.waitForTimeout(100);
      const stuck = await read();
      for (const s of [top, stuck]) {
        expect(s.bg).toBeGreaterThanOrEqual(0.92);
        expect(s.filter).toBe("none");
      }
      expect(stuck.height).toBe(top.height);
    });
  }
});

test.describe("V2-33 keyboard order equals main's, modulo the listed additions", () => {
  // Recorded from the base build (73287b4, PR #43) at 1280 by the same walk.
  const MAIN = JSON.parse(readFileSync("tests/fixtures/v2-e2e/tab-order-main.json", "utf8")) as Record<
    string,
    string[]
  >;
  // Intentional additions, listed in the PR body.
  const ADDED: Record<string, string[]> = { "./": ["Explore stories", "Try the tool"] };
  for (const path of PAGES) {
    test(`V2-33 /${path}`, async ({ page }) => {
      test.skip(projectWidth() !== 1280, "recorded at 1280");
      test.skip(MAIN[path] === undefined, "page not in the main recording");
      await page.goto(path);
      expect(
        await page
          .locator("[tabindex]")
          .evaluateAll((els) => els.filter((e) => (e as HTMLElement).tabIndex > 0).length),
      ).toBe(0);
      const names: string[] = [];
      for (let i = 0; i < 120; i++) {
        await page.keyboard.press("Tab");
        const n = await page.evaluate(() => {
          const el = document.activeElement;
          // Firefox keeps the last element active once focus leaves for the browser UI.
          const w = window as unknown as { __v2Last?: Element };
          if (!el || el === document.body || el === w.__v2Last) return null;
          w.__v2Last = el;
          return (el.getAttribute("aria-label") ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
        });
        if (n === null || (names.length > 0 && n === names[0] && i > 0)) break;
        names.push(n);
      }
      const added = ADDED[path] ?? [];
      expect(names.filter((n) => !added.includes(n))).toEqual(MAIN[path]);
    });
  }
});

test.describe("V2-35 targets, reflow and body text", () => {
  for (const path of PAGES) {
    test(`V2-35 /${path}`, async ({ page }) => {
      test.skip(projectWidth() !== 360, "run at the narrowest project; 320 and 200% zoom set below");
      await page.setViewportSize({ width: 320, height: 800 });
      await page.goto(path);
      const r = await page.evaluate(() => {
        const out: string[] = [];
        if (document.documentElement.scrollWidth > window.innerWidth)
          out.push(`320: scrollWidth ${document.documentElement.scrollWidth}`);
        for (const b of document.querySelectorAll(".button, .button-primary, .button-secondary, button")) {
          const box = b.getBoundingClientRect();
          if (box.width > 0 && box.height < 44) out.push(`button ${(b.textContent ?? "").trim()}: ${box.height}px`);
        }
        const body = parseFloat(getComputedStyle(document.body).fontSize);
        if (body < 16) out.push(`body ${body}px`);
        return out;
      });
      expect(r).toEqual([]);
      // 200% zoom at 1280 is a 640 CSS px layout.
      await page.setViewportSize({ width: 640, height: 400 });
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});
