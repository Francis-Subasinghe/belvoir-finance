/**
 * The single allowlist of Markdoc tags that content may use (ADR-0001, 0b).
 * Both the site renderer (markdoc.config.ts) and the content check
 * (src/lib/content-check.ts) are built from this object, so they can never
 * drift apart. Anything not listed here fails the content check.
 *
 * V1-54 (amends F3-39): exactly two tags, `callout` and `chart`. The chart tag
 * is strict: self-closing, only the five attributes below (Markdoc's global
 * `class` and `id` included in the ban), finite numbers, labels of at most 60
 * characters, at most 12 points and 1 or 2 series. Colours come from tokens by
 * series index, so there is no url, colour, class or style attribute.
 */
import type { NodeType } from "@markdoc/markdoc";

export const CALLOUT_TYPES = ["fact", "estimate", "example", "opinion"] as const;
export type CalloutType = (typeof CALLOUT_TYPES)[number];

export const CHART_LIMITS = { label: 60, points: 12, maxSeries: 2 } as const;
export const CHART_ATTRIBUTES = ["title", "units", "source", "categories", "series"] as const;

export interface ChartSeries {
  name: string;
  values: number[];
}
export interface ChartAttributes {
  title: string;
  units: string;
  source: string;
  categories: string[];
  series: ChartSeries[];
}

export interface ChartProblem {
  /** Attribute path, e.g. `series[0].values[3]`. */
  attr: string;
  rule:
    | "chart-unknown-attribute"
    | "chart-missing-attribute"
    | "chart-children"
    | "chart-label"
    | "chart-number"
    | "chart-points"
    | "chart-series"
    | "chart-source";
  message: string;
}

const SOURCE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function label(attr: string, v: unknown, out: ChartProblem[]) {
  if (typeof v !== "string" || v.trim() === "")
    out.push({ attr, rule: "chart-label", message: "must be a non-empty string" });
  else if ([...v].length > CHART_LIMITS.label)
    out.push({ attr, rule: "chart-label", message: `is ${[...v].length} characters; at most ${CHART_LIMITS.label}` });
}

/** Every V1-54 rule over one chart tag's attributes and child count. */
export function chartProblems(attrs: Record<string, unknown>, children = 0): ChartProblem[] {
  const out: ChartProblem[] = [];
  for (const key of Object.keys(attrs))
    if (!(CHART_ATTRIBUTES as readonly string[]).includes(key))
      out.push({
        attr: key,
        rule: "chart-unknown-attribute",
        message: `unknown attribute; a chart takes only ${CHART_ATTRIBUTES.join(", ")}`,
      });
  for (const key of CHART_ATTRIBUTES)
    if (attrs[key] === undefined) out.push({ attr: key, rule: "chart-missing-attribute", message: "is required" });
  if (children > 0)
    out.push({ attr: "", rule: "chart-children", message: "a chart has no content; write it as {% chart ... /%}" });

  if (attrs["title"] !== undefined) label("title", attrs["title"], out);
  if (attrs["units"] !== undefined) label("units", attrs["units"], out);
  const source = attrs["source"];
  if (source !== undefined && (typeof source !== "string" || !SOURCE_ID.test(source)))
    out.push({ attr: "source", rule: "chart-source", message: "must be the id of a Source entry" });

  const cats = attrs["categories"];
  let points = -1;
  if (cats !== undefined) {
    if (!Array.isArray(cats) || cats.length === 0)
      out.push({ attr: "categories", rule: "chart-points", message: "must be a list of 1 to 12 labels" });
    else {
      points = cats.length;
      if (cats.length > CHART_LIMITS.points)
        out.push({
          attr: `categories[${CHART_LIMITS.points}]`,
          rule: "chart-points",
          message: `${cats.length} points; at most ${CHART_LIMITS.points}`,
        });
      cats.forEach((c, i) => label(`categories[${i}]`, c, out));
    }
  }

  const series = attrs["series"];
  if (series !== undefined) {
    if (!Array.isArray(series) || series.length < 1 || series.length > CHART_LIMITS.maxSeries)
      out.push({ attr: "series", rule: "chart-series", message: "must be a list of 1 or 2 series" });
    else
      series.forEach((s: unknown, si) => {
        const at = `series[${si}]`;
        if (typeof s !== "object" || s === null || Array.isArray(s)) {
          out.push({ attr: at, rule: "chart-series", message: "must be { name, values }" });
          return;
        }
        const o = s as Record<string, unknown>;
        for (const k of Object.keys(o))
          if (k !== "name" && k !== "values")
            out.push({
              attr: `${at}.${k}`,
              rule: "chart-unknown-attribute",
              message: "a series has only name and values",
            });
        label(`${at}.name`, o["name"], out);
        const values = o["values"];
        if (!Array.isArray(values)) {
          out.push({ attr: `${at}.values`, rule: "chart-number", message: "must be a list of finite numbers" });
          return;
        }
        values.forEach((v, vi) => {
          if (typeof v !== "number" || !Number.isFinite(v))
            out.push({
              attr: `${at}.values[${vi}]`,
              rule: "chart-number",
              message: `${JSON.stringify(v)} is not a finite number`,
            });
        });
        if (values.length > CHART_LIMITS.points)
          out.push({
            attr: `${at}.values[${CHART_LIMITS.points}]`,
            rule: "chart-points",
            message: `${values.length} points; at most ${CHART_LIMITS.points}`,
          });
        if (points >= 0 && values.length !== points)
          out.push({
            attr: `${at}.values`,
            rule: "chart-points",
            message: `${values.length} values for ${points} categories`,
          });
      });
  }
  return out;
}

interface MarkdocNodeLike {
  attributes: Record<string, unknown>;
  children: unknown[];
}

export const allowedTags = {
  callout: {
    attributes: {
      type: { type: String, required: true, matches: [...CALLOUT_TYPES] as string[] },
      title: { type: String, required: false },
    },
  },
  chart: {
    selfClosing: true,
    children: [] as NodeType[],
    attributes: {
      title: { type: String, required: true },
      units: { type: String, required: true },
      source: { type: String, required: true },
      categories: { type: Array, required: true },
      series: { type: Array, required: true },
    },
    /** All V1-54 rules, as Markdoc errors whose message names the attribute and rule. */
    validate(node: MarkdocNodeLike) {
      return chartProblems(node.attributes, node.children.length).map((p) => ({
        id: p.rule,
        level: "error" as const,
        message: `chart ${p.attr ? `${p.attr}: ` : ""}${p.message} [${p.rule}]`,
      }));
    },
  },
};

export const allowedTagNames = Object.keys(allowedTags);
