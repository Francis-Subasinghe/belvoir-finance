// Writes a Lighthouse score table to $GITHUB_STEP_SUMMARY, or to stdout when run
// locally. Each cell is the median across the runs for that URL, matching the
// "median" aggregation in lighthouserc.cjs. Reads the filesystem upload written by
// `lhci upload --target=filesystem`.
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listPages, readBudgets, scriptBudget, seoExemption } from "./assertions.ts";

interface ManifestEntry {
  url: string;
  jsonPath: string;
}
interface Lhr {
  lighthouseVersion: string;
  environment: { hostUserAgent: string };
  configSettings: { formFactor: string };
  categories: Record<string, { score: number | null }>;
  audits: Record<
    string,
    { numericValue?: number; details?: { items?: { resourceType: string; transferSize: number }[] } }
  >;
}

const REPORT_DIR = ".lighthouseci/report";
const budgets = readBudgets(join(import.meta.dirname, "budgets.json"));
/** URL -> why SEO is not asserted ("demo", "404" or "placeholder"); same rule as the assertions. */
const seoExempt = new Map(
  (existsSync("dist-lhci") ? listPages("dist-lhci") : []).flatMap((p) => {
    const why = seoExemption(p);
    return why ? [[p.url, why] as const] : [];
  }),
);
const mode = process.env.LHCI_BLOCKING === "true" ? "blocking" : "report-only";
const out: string[] = [`## Lighthouse CI (${mode})`, ""];

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? NaN) : ((s[m - 1] ?? NaN) + (s[m] ?? NaN)) / 2;
};
const scriptBytes = (lhr: Lhr): number =>
  lhr.audits["resource-summary"]?.details?.items?.find((i) => i.resourceType === "script")?.transferSize ?? 0;

const manifestPath = join(REPORT_DIR, "manifest.json");
if (!existsSync(manifestPath)) {
  out.push("No Lighthouse reports were produced. See the collect step log.");
} else {
  const byUrl = new Map<string, Lhr[]>();
  for (const e of JSON.parse(readFileSync(manifestPath, "utf8")) as ManifestEntry[]) {
    byUrl.set(e.url, [...(byUrl.get(e.url) ?? []), JSON.parse(readFileSync(e.jsonPath, "utf8")) as Lhr]);
  }
  const cats = Object.keys(budgets.categories);
  const audits = Object.keys(budgets.audits);
  const heads = [...cats, "LCP", "CLS", "TBT", "JS (transfer)"];
  out.push(`| Page | Runs | ${heads.join(" | ")} |`, `| --- | --- |${" --- |".repeat(heads.length)}`);
  let misses = 0;
  let meta = "";
  const mark = (ok: boolean, text: string): string => {
    if (!ok) misses++;
    return ok ? text : `❌ ${text}`;
  };
  for (const [url, lhrs] of byUrl) {
    const first = lhrs[0];
    if (!first) continue;
    meta ||= `Lighthouse ${first.lighthouseVersion}, ${first.configSettings.formFactor} emulation, ${first.environment.hostUserAgent}`;
    const path = new URL(url).pathname;
    const exempt = seoExempt.get(url);
    const cells = cats.map((c) => {
      if (exempt && c === "seo") return `n/a (${exempt})`;
      const score = Math.round(median(lhrs.map((l) => l.categories[c]?.score ?? 0)) * 100);
      return mark(score >= Math.round((budgets.categories[c] ?? 1) * 100), String(score));
    });
    for (const a of audits) {
      const v = median(lhrs.map((l) => l.audits[a]?.numericValue ?? NaN));
      const shown = a === "cumulative-layout-shift" ? v.toFixed(3) : `${Math.round(v)} ms`;
      cells.push(mark(v < (budgets.audits[a] ?? 0), shown));
    }
    const js = median(lhrs.map(scriptBytes));
    const max = scriptBudget(budgets, path);
    cells.push(mark(js <= max, `${(js / 1024).toFixed(1)} / ${max / 1024} KB`));
    out.push(`| ${path}${exempt === "demo" ? " (demo)" : ""} | ${lhrs.length} | ${cells.join(" | ")} |`);
  }
  // Budgets are read from budgets.json, so the footer can't drift from what was asserted.
  const kb = (bytes: number) => (bytes === 0 ? "0 KB (no script)" : `≤ ${bytes / 1024} KB`);
  out.push(
    "",
    `Median per metric, mobile emulation. Budgets (TEST_STRATEGY.md): categories ≥ 90, LCP < 2500 ms, CLS < 0.1, TBT < 200 ms, JS ${kb(budgets.scriptTransferBytes.editorial)} per editorial page; images ≤ 100 KB per URL (V1-33); ${budgets.scriptTransferBytes.tools.map((t) => `${t.path} ${kb(t.max)}`).join(", ")}. ${misses} budget miss(es).`,
    'SEO is measured on a CI-only build with `PUBLIC_PREVIEW=false`. Pages marked `<meta name="belvoir-demo" content="true">`, `/belvoir-finance/404.html` and the Q-10 placeholder pages (SEO_EXEMPT_PATHS) are not asserted for SEO (their noindex is deliberate); every other budget still applies to them.',
    "JS is the transfer size of all scripts on the page, gzip-compressed by `astro preview`.",
    meta,
    "Full HTML and JSON reports are in the `lighthouse-reports` artifact.",
  );
}

const text = out.join("\n") + "\n";
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
else process.stdout.write(text);
