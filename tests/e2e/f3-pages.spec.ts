/**
 * F3 browser checks: storage after every page (F3-13), Explore and every page
 * with JavaScript off (F3-07, F3-38), and axe / layout on fixture builds that
 * the real content can't show: IE, other, a disclosure, a long title and a demo
 * story (F3-35), and the empty Source library (F3-49). Fixture builds are made
 * in a temporary copy of the repo and served by routing the site URL to their
 * dist/ files, so no extra server or port is needed.
 */
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { AXE_TAGS, overflowProblems, renderedGoldProblems, targetSizeProblems } from "../helpers/e2e-checks";
import { sitePaths } from "../helpers/e2e-pages";
import { SITE } from "../helpers/e2e-urls";
import { astroBuild, makeSite, type Site } from "../helpers/fixture-build";

const PAGES = sitePaths();

test("F3-13 visiting every page leaves no cookies, localStorage or sessionStorage", async ({ page, context }) => {
  for (const path of PAGES) {
    await page.goto(path);
    const storage = await page.evaluate(() => [localStorage.length, sessionStorage.length]);
    expect(storage, path).toEqual([0, 0]);
  }
  expect(await context.cookies()).toEqual([]);
});

test.describe("F3-07 / F3-38 with JavaScript disabled", () => {
  test.use({ javaScriptEnabled: false });

  test("F3-07 Explore lists every topic section, links between them and to /stories/", async ({ page }) => {
    await page.goto("explore/");
    const groups = page.getByTestId("explore-group");
    expect(await groups.count()).toBeGreaterThan(0);
    const first = page.getByRole("navigation", { name: "Topics on this page" }).getByRole("link").first();
    const href = await first.getAttribute("href");
    await first.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole("link", { name: "All stories, newest first" })).toHaveAttribute(
      "href",
      "/belvoir-finance/stories/",
    );
    await expect(page.locator("input, select, textarea, button")).toHaveCount(0);
  });

  test("F3-38 every page renders its h1 and main content without JavaScript", async ({ page }) => {
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator("main h1"), path).toHaveCount(1);
      expect(await page.locator("main").innerText(), path).not.toBe("");
    }
  });
});

/* ---------------------------------------------------------------- fixture builds */

async function serve(page: Page, site: Site): Promise<void> {
  await page.route(`${SITE}**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/belvoir-finance\//, "");
    let file = join(site.dist, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) file = join(site.dist, "404.html");
    await route.fulfill({ path: file });
  });
}

async function a11y(page: Page): Promise<{ bad: string[]; region: number }> {
  const r = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  return {
    bad: r.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    region: r.violations.filter((v) => v.id === "region").length,
  };
}

test.describe("F3-35 rich fixture build (IE, other, disclosure, long title, demo story, XSS strings)", () => {
  test.describe.configure({ mode: "serial" });
  let site: Site;
  test.beforeAll(() => {
    site = makeSite(["tests/fixtures/content/base"]);
    const r = astroBuild(site);
    if (r.status !== 0) throw new Error(r.output);
  });
  test.afterAll(() => site?.cleanup());

  test("F3-35 / F3-36 / F3-37 axe, overflow, targets and gold on every fixture page", async ({ page }) => {
    test.setTimeout(180_000);
    await serve(page, site);
    const problems: string[] = [];
    for (const path of sitePaths("tests/fixtures/content/base")) {
      await page.goto(path);
      const { bad, region } = await a11y(page);
      if (region > 0) bad.push("region");
      for (const p of [
        ...bad,
        ...(await overflowProblems(page)),
        ...(await targetSizeProblems(page)),
        ...(await renderedGoldProblems(page)),
      ])
        problems.push(`/${path}: ${p}`);
    }
    expect(problems).toEqual([]);
  });

  test("F3-39 the XSS fixture runs no script in the browser", async ({ page }) => {
    await serve(page, site);
    const dialogs: string[] = [];
    page.on("dialog", async (d) => {
      dialogs.push(d.message());
      await d.dismiss();
    });
    for (const path of ["stories/fx-xss-story/", "stories/", "explore/"]) await page.goto(path);
    expect(dialogs).toEqual([]);
    await page.goto("stories/fx-xss-story/");
    await expect(page.locator("main h1")).toContainText("</script><script>alert(1)</script>");
    await expect(page.getByTestId("disclosure")).toContainText("<img src=x onerror=alert(1)>");
  });
});

test.describe("F3-49 empty Source library fixture build", () => {
  test.describe.configure({ mode: "serial" });
  let site: Site;
  test.beforeAll(() => {
    site = makeSite(["tests/fixtures/content/base", "tests/fixtures/content/overlays/no-active-sources"]);
    const r = astroBuild(site);
    if (r.status !== 0) throw new Error(r.output);
  });
  test.afterAll(() => site?.cleanup());

  test("F3-49 the empty state shows, with 0 serious or critical axe violations and no overflow", async ({ page }) => {
    await serve(page, site);
    await page.goto("sources/");
    await expect(page.locator("main h1")).toHaveText("Source library");
    await expect(page.getByTestId("sources-empty")).toBeVisible();
    await expect(page.getByTestId("source-list")).toHaveCount(0);
    const { bad, region } = await a11y(page);
    expect(bad).toEqual([]);
    expect(region).toBe(0);
    expect(await overflowProblems(page)).toEqual([]);
  });
});

test("F3-49 the real build shows the source list, not the empty state", async ({ page }) => {
  await page.goto("sources/");
  await expect(page.getByTestId("source-list")).toBeVisible();
  await expect(page.getByTestId("sources-empty")).toHaveCount(0);
  await expect(page.getByTestId("source-entry").first()).toContainText("Demo");
});
