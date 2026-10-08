/**
 * F4-18: the one summary sentence. The "goes below zero" phrase is shown only
 * when the lowest balance displays as negative (S3-16's -£0.49 displays as
 * £0, so it says nothing about going below zero). Pure (F4-01).
 */
import type { Result } from "./calculate.ts";
import { displaysNegative, formatGBP } from "./format.ts";

function cashClause(cashChange: number): string {
  const size = formatGBP(Math.abs(cashChange));
  if (size === "£0") return "cash ends where it started";
  return `cash ${cashChange < 0 ? "falls" : "rises"} by ${size}`;
}

export function summary(result: Result): string {
  const profit = formatGBP(result.totalProfit);
  const lowest = formatGBP(result.lowest);
  // "but" when profit and the cash change differ on screen, "and" when they match.
  const joiner = profit === formatGBP(result.cashChange) ? "and" : "but";
  const below = displaysNegative(result.lowest) ? ", when it goes below zero" : "";
  return `Over 6 months, profit is ${profit} ${joiner} ${cashClause(result.cashChange)}. Cash is lowest at ${lowest} in month ${result.lowestMonth}${below}.`;
}
