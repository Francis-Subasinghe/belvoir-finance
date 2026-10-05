/**
 * F3-40 regression guard for PR #22's Lighthouse failure (/explore/ CLS 0.108 on
 * the CI runner). The web fonts swap in (font-display: swap, F2-15), so if the
 * fallback's metrics don't match, whole sections move when the woff2 arrives.
 * Here every font response is held back so text certainly paints in the
 * fallback first, then the layout shift is summed until the fonts are in.
 * The metric-matched fallback faces (src/styles/font-fallbacks.css) keep
 * that well under Lighthouse's 0.1 budget; the limit here is much tighter
 * so a regression shows up long before CI.
 *
 * It runs at Lighthouse's mobile viewport (412 × 823), the size the CLS budget
 * is asserted at. At other widths a paragraph that sits right on a line-break
 * boundary can still wrap one line differently in the fallback (average glyph
 * widths match, individual lines don't), so those widths aren't held to this
 * limit.
 */
import { expect, test } from "@playwright/test";
import { sitePaths } from "../helpers/e2e-pages";

const FONT_DELAY_MS = 600;
const CLS_LIMIT = 0.02;

test.use({ viewport: { width: 412, height: 823 } });

for (const path of sitePaths()) {
  test(`F3-40 the web-font swap moves nothing on ${path} (CLS < ${CLS_LIMIT} at 412 px with fonts delayed)`, async ({
    page,
  }) => {
    await page.route(/\.woff2(\?|$)/, async (route) => {
      await new Promise((r) => setTimeout(r, FONT_DELAY_MS));
      await route.continue();
    });
    await page.addInitScript(() => {
      const w = window as unknown as { __cls: number; __shifts: string[] };
      w.__cls = 0;
      w.__shifts = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as {
          value: number;
          hadRecentInput: boolean;
          sources: { node?: Node | null }[];
        }[]) {
          if (e.hadRecentInput) continue;
          w.__cls += e.value;
          w.__shifts.push(`${e.value.toFixed(4)} ${e.sources.map((s) => s.node?.nodeName ?? "?").join(",")}`);
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(path);
    const fontsSwapped = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((f) => f.status === "loaded").length;
    });
    expect(fontsSwapped, "the web fonts did load (so the swap was measured)").toBeGreaterThan(0);
    await page.waitForTimeout(200);
    const [cls, shifts] = await page.evaluate(() => {
      const w = window as unknown as { __cls: number; __shifts: string[] };
      return [w.__cls, w.__shifts] as const;
    });
    expect(cls, `layout shifts: ${shifts.join(" | ")}`).toBeLessThan(CLS_LIMIT);
  });
}
