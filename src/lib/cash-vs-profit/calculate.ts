/**
 * F4-02 to F4-05 / D-4: the cash-versus-profit model. Sales and costs are the
 * same every month from month 1, nothing is owed before month 1, the horizon
 * is 6 months of 30 days, and a payment lands ⌈days ÷ 30⌉ whole months after
 * the month it belongs to. No tax, VAT, interest, depreciation, stock or
 * growth. All arithmetic is in integer pence. Pure (F4-01).
 */
import { DAYS_MAX, MONEY_MAX_PENCE } from "./parse.ts";

export const MONTHS = 6;
export const DAYS_PER_MONTH = 30;

export interface Inputs {
  salesPence: number;
  costsPence: number;
  customerDays: number;
  supplierDays: number;
  openingPence: number;
}

export interface MonthRow {
  month: number;
  profit: number;
  cashIn: number;
  cashOut: number;
  closing: number;
}

export interface Result {
  months: MonthRow[];
  totalProfit: number;
  cashChange: number;
  gap: number;
  lowest: number;
  lowestMonth: number;
}

const FIELDS: readonly { key: keyof Inputs; max: number }[] = [
  { key: "salesPence", max: MONEY_MAX_PENCE },
  { key: "costsPence", max: MONEY_MAX_PENCE },
  { key: "customerDays", max: DAYS_MAX },
  { key: "supplierDays", max: DAYS_MAX },
  { key: "openingPence", max: MONEY_MAX_PENCE },
];

/** F4-05: throws (never returns) unless the value is a whole number from 0 to its cap. -0 becomes 0. */
function checked(inputs: unknown, key: keyof Inputs, max: number): number {
  if (typeof inputs !== "object" || inputs === null) throw new TypeError("calculate needs an inputs object");
  if (!Object.hasOwn(inputs, key)) throw new TypeError(`${key} is missing`);
  const value: unknown = (inputs as Record<string, unknown>)[key];
  if (typeof value !== "number") throw new TypeError(`${key} must be a number, got ${typeof value}`);
  if (!Number.isInteger(value)) throw new RangeError(`${key} must be a whole number, got ${String(value)}`);
  if (value < 0 || value > max) throw new RangeError(`${key} must be from 0 to ${max}, got ${String(value)}`);
  return value + 0; // -0 + 0 is 0
}

/** Months a payment waits: 0 days is the same month, 1 to 30 days is one month, 31 is two. */
export function lagMonths(days: number): number {
  return Math.ceil(days / DAYS_PER_MONTH);
}

export function calculate(inputs: Inputs): Result {
  const [sales, costs, customerDays, supplierDays, opening] = FIELDS.map((f) => checked(inputs, f.key, f.max)) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const inLag = lagMonths(customerDays);
  const outLag = lagMonths(supplierDays);
  const months: MonthRow[] = [];
  let balance = opening;
  let lowest = Number.POSITIVE_INFINITY;
  let lowestMonth = 0;
  for (let month = 1; month <= MONTHS; month++) {
    const cashIn = month - inLag >= 1 ? sales : 0;
    const cashOut = month - outLag >= 1 ? costs : 0;
    balance = balance + cashIn - cashOut;
    months.push({ month, profit: sales - costs, cashIn, cashOut, closing: balance });
    if (balance < lowest) {
      lowest = balance;
      lowestMonth = month;
    }
  }
  const totalProfit = MONTHS * (sales - costs);
  const cashChange = balance - opening;
  return { months, totalProfit, cashChange, gap: totalProfit - cashChange, lowest, lowestMonth };
}
