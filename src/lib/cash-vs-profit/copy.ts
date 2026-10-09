/**
 * F4-12, F4-16, F4-18, F4-35, F4-41 / Q-5: the one copy table. Tests key on
 * error codes and compare visible text against these strings, so a wording
 * change touches this file and nowhere else. Pure (F4-01).
 */
import type { DaysErrorCode, MoneyErrorCode } from "./parse.ts";

export type FieldId = "sales" | "costs" | "customerDays" | "supplierDays" | "opening";

export interface FieldCopy {
  id: FieldId;
  kind: "money" | "days";
  label: string;
  hint: string;
}

export const FIELDS: readonly FieldCopy[] = [
  { id: "sales", kind: "money", label: "Monthly sales", hint: "Pounds a month, up to £10,000,000" },
  { id: "costs", kind: "money", label: "Monthly costs", hint: "Pounds a month, up to £10,000,000" },
  {
    id: "customerDays",
    kind: "days",
    label: "Days your customers take to pay",
    hint: "Whole days, from 0 to 180",
  },
  { id: "supplierDays", kind: "days", label: "Days you take to pay suppliers", hint: "Whole days, from 0 to 180" },
  { id: "opening", kind: "money", label: "Cash at the start", hint: "Pounds, up to £10,000,000" },
];

const MONEY_MESSAGES: Record<MoneyErrorCode, (label: string) => string> = {
  blank: (label) => `Enter ${label.toLowerCase()}`,
  invalid: (label) => `Enter ${label.toLowerCase()} in pounds, like 20,000 or 20,000.50`,
  decimals: (label) => `${label} can have up to 2 decimal places`,
  negative: (label) => `${label} can't be negative`,
  overMax: (label) => `${label} must be £10,000,000 or less`,
};

const DAYS_MESSAGES: Record<DaysErrorCode, (label: string) => string> = {
  blank: (label) => `Enter ${label.toLowerCase()}`,
  invalid: (label) => `Enter ${label.toLowerCase()} as a whole number, like 30`,
  notWhole: (label) => `${label} must be a whole number`,
  daysRange: (label) => `${label} must be between 0 and 180`,
};

export function errorMessage(kind: "money" | "days", code: string, label: string): string {
  const table = kind === "money" ? MONEY_MESSAGES : DAYS_MESSAGES;
  const message = (table as Record<string, (l: string) => string>)[code];
  if (!message) throw new RangeError(`no message for ${kind} code ${code}`);
  return message(label);
}

/** "2 answers" / "1 answer". */
export function errorCountSentence(count: number): string {
  return `Results not updated. ${count} ${count === 1 ? "answer needs" : "answers need"} fixing.`;
}

export const FIX_ANSWERS = "Fix the answers marked with an error to see results.";
export const ROUNDED_NOTE = "Figures are rounded to the nearest pound.";
export const DISCLAIMER =
  "Illustrative example only. It isn't financial advice and uses no current tax rates or official values.";
export const TABLE_CAPTION = "Illustrative cash and profit, month by month";
export const NOJS_NOTE = "To change these figures, turn on JavaScript. The worked example uses the default values.";
export const JS_NOTE = "Change any value, then press Enter or Update results.";
export const RESET_NOTE = "Reset to the example values.";
export const UPDATE_LABEL = "Update results";
export const RESET_LABEL = "Reset";
export const MONTH_HEADERS = ["Month", "Profit", "Cash in", "Cash out", "Closing cash"] as const;

/** Months are named "month 1" ... "month 6", matching the summary sentence. */
export function monthName(month: number): string {
  return `Month ${month}`;
}

export const EXPLORER_HEADING = "Explore the figures";
export const FIELDSET_LEGEND = "Your business, each month";
export const RESULTS_HEADING = "Results";
export const HOW_HEADING = "How this works";
/** F4-35: a short, plain explanation of the D-4 model. */
export const HOW_IT_WORKS: readonly string[] = [
  "Profit is what you earn minus what you spend. Cash is what is in the bank. The two drift apart when your customers pay you later than you pay your suppliers.",
  "The explorer uses the same sales and costs every month for 6 months, starting in month 1, and counts each month as 30 days. A payment arrives a whole number of months later: 0 days is the same month, 1 to 30 days is one month later, 31 to 60 days is two months later, and so on.",
  "It leaves out tax, VAT, interest, stock and growth, so it shows the timing gap and nothing else.",
];
