/**
 * F4-39 / Q-2: the one source of truth for the worked example. The page
 * pre-fills these strings exactly, and the pre-rendered results come from
 * running them through parse and calculate.
 */
import type { Inputs } from "./calculate.ts";

export const DEFAULTS = {
  sales: "£20,000",
  costs: "£15,000",
  customerDays: "60",
  supplierDays: "30",
  opening: "£10,000",
} as const;

export const DEFAULT_INPUTS: Inputs = {
  salesPence: 2_000_000,
  costsPence: 1_500_000,
  customerDays: 60,
  supplierDays: 30,
  openingPence: 1_000_000,
};
