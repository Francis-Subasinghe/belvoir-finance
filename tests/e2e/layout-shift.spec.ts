/**
 * Web-font swap guards. The web fonts use font-display: swap (F2-15), so text
 * first paints in the metric-matched fallback faces (src/styles/font-fallbacks.css)
 * and re-lays out when the woff2 arrives. Here every font response is held
 * back so text certainly paints in the fallback first, then the layout shift
 * is summed until the fonts are in.
 *
 * - F3-40 (PR #22's Lighthouse failure, /explore/ CLS 0.108 on the CI runner):
 *   at Lighthouse's mobile viewport (412 × 823), where the CLS budget is
 *   asserted, the swap must stay far under the budget (< 0.02), so a
 *   regression shows up long before CI.
 * - V1 (D-3, V1-35/V1-36: V1 adds no shift, fonts add no shift): at each
 *   project's own width (360, 768 and 1280 px) every page, /cookies/ at 360
 *   included, stays within Lighthouse's 0.1. At these widths one paragraph that
 *   sits right on a line-break boundary can still wrap one line differently in
 *   the fallback (average glyph widths match, individual lines don't), so the
 *   limit is the budget itself. Widths in `ch` used to make every prose block
 *   change width on swap (0.20 on /editorial-standards/ at 768); `--measure` is
 *   now in rem for that reason. The footer links were a wrapping flex row, so a
 *   link could jump to the next line on swap (0.11 on /cookies/ at 360); they are
 *   a grid now, placed by container width only.
 *
 * Run it with only CI's system fonts (DejaVu, Liberation) for CI-like numbers:
 * a machine with Arial or Inter installed locally hides the problem.
 */
import { expect, test, type Page } from "@playwright/test";
import { sitePaths } from "../helpers/e2e-pages";

const FONT_DELAY_MS = 600;
const F3_CLS_LIMIT = 0.02;
const V1_CLS_LIMIT = 0.1;

async function swapShift(page: Page, path: string): Promise<{ cls: number; shifts: string[] }> {
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
  return { cls, shifts: [...shifts] };
}

test.describe("F3-40 at Lighthouse's mobile viewport", () => {
  test.use({ viewport: { width: 412, height: 823 } });
  for (const path of sitePaths()) {
    test(`F3-40 the web-font swap moves nothing on ${path} (CLS < ${F3_CLS_LIMIT} at 412 px with fonts delayed)`, async ({
      page,
    }) => {
      const { cls, shifts } = await swapShift(page, path);
      expect(cls, `layout shifts: ${shifts.join(" | ")}`).toBeLessThan(F3_CLS_LIMIT);
    });
  }
});

test.describe("V1 font-delay guard at 360, 768 and 1280 px", () => {
  for (const path of sitePaths()) {
    test(`V1-36 the web-font swap keeps CLS <= ${V1_CLS_LIMIT} on ${path} at the project width`, async ({ page }) => {
      const { cls, shifts } = await swapShift(page, path);
      expect(cls, `layout shifts: ${shifts.join(" | ")}`).toBeLessThanOrEqual(V1_CLS_LIMIT);
    });
  }

  test("V1-36 the guard covers /cookies/ (the tightest page at 360 px)", () => {
    expect(sitePaths()).toContain("cookies/");
  });
});
