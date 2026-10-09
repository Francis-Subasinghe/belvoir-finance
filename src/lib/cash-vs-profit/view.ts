/**
 * The one path from what the user typed to what the page shows, used by the
 * build (the pre-rendered worked example, F4-06) and by the browser script
 * (every commit). Pure (F4-01): strings in, strings out.
 */
import { calculate, type Inputs } from "./calculate.ts";
import { errorMessage, FIELDS, type FieldId } from "./copy.ts";
import { formatGBP } from "./format.ts";
import { parseDays, parseMoney } from "./parse.ts";
import { summary } from "./summary.ts";

export type RawInputs = Record<FieldId, string>;

export interface FieldError {
  id: FieldId;
  code: string;
  message: string;
}

export interface ViewRow {
  month: number;
  profit: string;
  cashIn: string;
  cashOut: string;
  closing: string;
}

export type View =
  { ok: true; rows: ViewRow[]; summary: string; lowestNegative: boolean } | { ok: false; errors: FieldError[] };

const KEYS: Record<FieldId, keyof Inputs> = {
  sales: "salesPence",
  costs: "costsPence",
  customerDays: "customerDays",
  supplierDays: "supplierDays",
  opening: "openingPence",
};

export function view(raw: RawInputs): View {
  const errors: FieldError[] = [];
  const inputs: Partial<Inputs> = {};
  for (const field of FIELDS) {
    const text = raw[field.id];
    const parsed = field.kind === "money" ? parseMoney(text) : parseDays(text);
    if (parsed.ok) {
      inputs[KEYS[field.id]] = "pence" in parsed ? parsed.pence : parsed.days;
    } else {
      errors.push({ id: field.id, code: parsed.code, message: errorMessage(field.kind, parsed.code, field.label) });
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  const result = calculate(inputs as Inputs);
  return {
    ok: true,
    rows: result.months.map((m) => ({
      month: m.month,
      profit: formatGBP(m.profit),
      cashIn: formatGBP(m.cashIn),
      cashOut: formatGBP(m.cashOut),
      closing: formatGBP(m.closing),
    })),
    summary: summary(result),
    lowestNegative: formatGBP(result.lowest).startsWith("-"),
  };
}
