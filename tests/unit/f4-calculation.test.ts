/**
 * F4-02 to F4-15 and the S3 table: the pure cash-versus-profit modules in
 * plain Node. Expected values are copied from docs/qa/AC_F4_TOOL.md (Sentinel's
 * independent reference), never computed by the code under test.
 */
import { describe, expect, it } from "vitest";
import { calculate, lagMonths, MONTHS, type Inputs } from "../../src/lib/cash-vs-profit/calculate.ts";
import { DISCLAIMER, errorCountSentence, errorMessage, FIELDS, NOJS_NOTE } from "../../src/lib/cash-vs-profit/copy.ts";
import { DEFAULT_INPUTS, DEFAULTS } from "../../src/lib/cash-vs-profit/defaults.ts";
import { formatGBP, moneySegments } from "../../src/lib/cash-vs-profit/format.ts";
import { DAYS_MAX, MONEY_MAX_PENCE, parseDays, parseMoney } from "../../src/lib/cash-vs-profit/parse.ts";
import { summary } from "../../src/lib/cash-vs-profit/summary.ts";
import { view } from "../../src/lib/cash-vs-profit/view.ts";

/** "1,000.50" (pounds as written in the S3 table) → pence, by digit strings. */
function poundsToPence(s: string): number {
  const [whole = "0", frac = ""] = s.replace(/,/g, "").split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/* ------------------------------------------------------------- S3 table */

interface S3Row {
  id: string;
  name: string;
  sales: string;
  costs: string;
  cd: number;
  sd: number;
  opening: string;
  closing: string[];
  profit: string;
  change: string;
  lowest: string;
  lowestMonth: number;
}

const S3: S3Row[] = [
  {
    id: "S3-01",
    name: "default example",
    sales: "20,000",
    costs: "15,000",
    cd: 60,
    sd: 30,
    opening: "10,000",
    closing: ["£10,000", "-£5,000", "£0", "£5,000", "£10,000", "£15,000"],
    profit: "£30,000",
    change: "£5,000",
    lowest: "-£5,000",
    lowestMonth: 2,
  },
  {
    id: "S3-02",
    name: "same terms both sides",
    sales: "20,000",
    costs: "15,000",
    cd: 30,
    sd: 30,
    opening: "0",
    closing: ["£0", "£5,000", "£10,000", "£15,000", "£20,000", "£25,000"],
    profit: "£30,000",
    change: "£25,000",
    lowest: "£0",
    lowestMonth: 1,
  },
  {
    id: "S3-03",
    name: "paid on the day",
    sales: "20,000",
    costs: "15,000",
    cd: 0,
    sd: 0,
    opening: "10,000",
    closing: ["£15,000", "£20,000", "£25,000", "£30,000", "£35,000", "£40,000"],
    profit: "£30,000",
    change: "£30,000",
    lowest: "£15,000",
    lowestMonth: 1,
  },
  {
    id: "S3-04",
    name: "loss-making",
    sales: "10,000",
    costs: "12,000",
    cd: 30,
    sd: 30,
    opening: "5,000",
    closing: ["£5,000", "£3,000", "£1,000", "-£1,000", "-£3,000", "-£5,000"],
    profit: "-£12,000",
    change: "-£10,000",
    lowest: "-£5,000",
    lowestMonth: 6,
  },
  {
    id: "S3-05",
    name: "all zero (tie: first month)",
    sales: "0",
    costs: "0",
    cd: 0,
    sd: 0,
    opening: "0",
    closing: ["£0", "£0", "£0", "£0", "£0", "£0"],
    profit: "£0",
    change: "£0",
    lowest: "£0",
    lowestMonth: 1,
  },
  {
    id: "S3-06",
    name: "customers at the cap",
    sales: "20,000",
    costs: "15,000",
    cd: 180,
    sd: 0,
    opening: "0",
    closing: ["-£15,000", "-£30,000", "-£45,000", "-£60,000", "-£75,000", "-£90,000"],
    profit: "£30,000",
    change: "-£90,000",
    lowest: "-£90,000",
    lowestMonth: 6,
  },
  {
    id: "S3-07",
    name: "suppliers at the cap",
    sales: "20,000",
    costs: "15,000",
    cd: 0,
    sd: 180,
    opening: "0",
    closing: ["£20,000", "£40,000", "£60,000", "£80,000", "£100,000", "£120,000"],
    profit: "£30,000",
    change: "£120,000",
    lowest: "£20,000",
    lowestMonth: 1,
  },
  {
    id: "S3-08",
    name: "30 days is one month",
    sales: "20,000",
    costs: "15,000",
    cd: 30,
    sd: 0,
    opening: "0",
    closing: ["-£15,000", "-£10,000", "-£5,000", "£0", "£5,000", "£10,000"],
    profit: "£30,000",
    change: "£10,000",
    lowest: "-£15,000",
    lowestMonth: 1,
  },
  {
    id: "S3-09",
    name: "31 days is two months",
    sales: "20,000",
    costs: "15,000",
    cd: 31,
    sd: 0,
    opening: "0",
    closing: ["-£15,000", "-£30,000", "-£25,000", "-£20,000", "-£15,000", "-£10,000"],
    profit: "£30,000",
    change: "-£10,000",
    lowest: "-£30,000",
    lowestMonth: 2,
  },
  {
    id: "S3-10",
    name: "1 day is one month",
    sales: "20,000",
    costs: "15,000",
    cd: 1,
    sd: 0,
    opening: "0",
    closing: ["-£15,000", "-£10,000", "-£5,000", "£0", "£5,000", "£10,000"],
    profit: "£30,000",
    change: "£10,000",
    lowest: "-£15,000",
    lowestMonth: 1,
  },
  {
    id: "S3-11",
    name: "pence; totals from exact pence",
    sales: "1,000.50",
    costs: "999.99",
    cd: 0,
    sd: 0,
    opening: "0",
    closing: ["£1", "£1", "£2", "£2", "£3", "£3"],
    profit: "£3",
    change: "£3",
    lowest: "£1",
    lowestMonth: 1,
  },
  {
    id: "S3-12",
    name: "half pounds below zero",
    sales: "0",
    costs: "0.50",
    cd: 0,
    sd: 0,
    opening: "0",
    closing: ["-£1", "-£1", "-£2", "-£2", "-£3", "-£3"],
    profit: "-£3",
    change: "-£3",
    lowest: "-£3",
    lowestMonth: 6,
  },
  {
    id: "S3-13",
    name: 'never "-£0"',
    sales: "0",
    costs: "0.49",
    cd: 0,
    sd: 0,
    opening: "0",
    closing: ["£0", "-£1", "-£1", "-£2", "-£2", "-£3"],
    profit: "-£3",
    change: "-£3",
    lowest: "-£3",
    lowestMonth: 6,
  },
  {
    id: "S3-14",
    name: "maximum values",
    sales: "10,000,000",
    costs: "10,000,000",
    cd: 0,
    sd: 180,
    opening: "10,000,000",
    closing: ["£20,000,000", "£30,000,000", "£40,000,000", "£50,000,000", "£60,000,000", "£70,000,000"],
    profit: "£0",
    change: "£60,000,000",
    lowest: "£20,000,000",
    lowestMonth: 1,
  },
  {
    id: "S3-15",
    name: "lowest possible cash",
    sales: "0",
    costs: "10,000,000",
    cd: 0,
    sd: 0,
    opening: "0",
    closing: ["-£10,000,000", "-£20,000,000", "-£30,000,000", "-£40,000,000", "-£50,000,000", "-£60,000,000"],
    profit: "-£60,000,000",
    change: "-£60,000,000",
    lowest: "-£60,000,000",
    lowestMonth: 6,
  },
  {
    id: "S3-16",
    name: "a dip that displays as £0",
    sales: "0",
    costs: "0.49",
    cd: 0,
    sd: 0,
    opening: "2.45",
    closing: ["£2", "£1", "£1", "£0", "£0", "£0"],
    profit: "-£3",
    change: "-£3",
    lowest: "£0",
    lowestMonth: 6,
  },
];

const inputsOf = (r: S3Row): Inputs => ({
  salesPence: poundsToPence(r.sales),
  costsPence: poundsToPence(r.costs),
  customerDays: r.cd,
  supplierDays: r.sd,
  openingPence: poundsToPence(r.opening),
});

describe("F4-03 S3 calculation table", () => {
  it.each(S3.map((r) => [`${r.id} ${r.name}`, r] as const))("F4-03 %s", (_name, r) => {
    const result = calculate(inputsOf(r));
    expect(result.months.map((m) => formatGBP(m.closing))).toEqual(r.closing);
    expect(formatGBP(result.totalProfit)).toBe(r.profit);
    expect(formatGBP(result.cashChange)).toBe(r.change);
    expect(formatGBP(result.lowest)).toBe(r.lowest);
    expect(result.lowestMonth).toBe(r.lowestMonth);
  });

  it("F4-03 S3-01 month by month (the worked example on the page)", () => {
    const rows = calculate(inputsOf(S3[0] as S3Row)).months.map((m) => [
      m.month,
      formatGBP(m.profit),
      formatGBP(m.cashIn),
      formatGBP(m.cashOut),
      formatGBP(m.closing),
    ]);
    expect(rows).toEqual([
      [1, "£5,000", "£0", "£0", "£10,000"],
      [2, "£5,000", "£0", "£15,000", "-£5,000"],
      [3, "£5,000", "£20,000", "£15,000", "£0"],
      [4, "£5,000", "£20,000", "£15,000", "£5,000"],
      [5, "£5,000", "£20,000", "£15,000", "£10,000"],
      [6, "£5,000", "£20,000", "£15,000", "£15,000"],
    ]);
  });

  it("F4-03 the S3 inputs typed into the fields give the same table (parse → calculate → format)", () => {
    for (const r of S3) {
      const v = view({
        sales: r.sales,
        costs: r.costs,
        customerDays: String(r.cd),
        supplierDays: String(r.sd),
        opening: r.opening,
      });
      expect(v.ok, r.id).toBe(true);
      if (v.ok)
        expect(
          v.rows.map((row) => row.closing),
          r.id,
        ).toEqual(r.closing);
    }
  });
});

/* ------------------------------------------------------------ F4-02 model */

describe("F4-02 the model is exactly D-4", () => {
  it("F4-02 returns months 1 to 6 with profit, cash in, cash out and closing, in pence", () => {
    const r = calculate(DEFAULT_INPUTS);
    expect(MONTHS).toBe(6);
    expect(r.months).toHaveLength(6);
    expect(r.months[0]).toEqual({ month: 1, profit: 500_000, cashIn: 0, cashOut: 0, closing: 1_000_000 });
    expect(r.months[1]).toEqual({ month: 2, profit: 500_000, cashIn: 0, cashOut: 1_500_000, closing: -500_000 });
    expect(r).toMatchObject({
      totalProfit: 3_000_000,
      cashChange: 500_000,
      gap: 2_500_000,
      lowest: -500_000,
      lowestMonth: 2,
    });
  });

  it("F4-02 payment lag is ⌈days ÷ 30⌉ whole months (0 days is the same month)", () => {
    expect([0, 1, 29, 30, 31, 59, 60, 61, 150, 151, 179, 180].map(lagMonths)).toEqual([
      0, 1, 1, 1, 2, 2, 2, 3, 5, 6, 6, 6,
    ]);
  });

  it("F4-02 lowestMonth is the first month with the lowest closing balance", () => {
    const r = calculate({ salesPence: 100, costsPence: 100, customerDays: 0, supplierDays: 0, openingPence: 0 });
    expect(r.months.map((m) => m.closing)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(r.lowestMonth).toBe(1);
  });
});

/* -------------------------------------------------------- F4-04 invariants */

/** xorshift32, fixed seed: the same 10,000 cases on every run. */
function rng(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
}

describe("F4-04 invariants", () => {
  const SEED = 0x5eed_f404;
  const MONEY_EDGES = [0, 1, 49, 50, 99, 100, 150, MONEY_MAX_PENCE - 1, MONEY_MAX_PENCE];
  const DAY_EDGES = [0, 1, 29, 30, 31, 59, 60, 61, 149, 150, 151, 179, 180];

  function* cases(): Generator<Inputs> {
    for (const salesPence of MONEY_EDGES)
      for (const costsPence of MONEY_EDGES)
        for (const customerDays of DAY_EDGES)
          for (const supplierDays of DAY_EDGES)
            yield {
              salesPence,
              costsPence,
              customerDays,
              supplierDays,
              openingPence: (salesPence * 7 + costsPence) % (MONEY_MAX_PENCE + 1),
            };
    const next = rng(SEED);
    for (let i = 0; i < 10_000; i++) {
      yield {
        salesPence: next() % (MONEY_MAX_PENCE + 1),
        costsPence: next() % (MONEY_MAX_PENCE + 1),
        customerDays: next() % (DAYS_MAX + 1),
        supplierDays: next() % (DAYS_MAX + 1),
        openingPence: next() % (MONEY_MAX_PENCE + 1),
      };
    }
  }

  it(`F4-04 seed 0x5eedf404: 10,000 random + 13,689 boundary inputs keep every identity`, () => {
    let n = 0;
    for (const input of cases()) {
      n++;
      const r = calculate(input);
      const sumIn = r.months.reduce((a, m) => a + m.cashIn, 0);
      const sumOut = r.months.reduce((a, m) => a + m.cashOut, 0);
      const inLag = Math.min(Math.ceil(input.customerDays / 30), 6);
      const outLag = Math.min(Math.ceil(input.supplierDays / 30), 6);
      const ok =
        r.cashChange === sumIn - sumOut &&
        r.totalProfit === 6 * (input.salesPence - input.costsPence) &&
        r.gap === inLag * input.salesPence - outLag * input.costsPence &&
        r.months.every((m) => r.lowest <= m.closing) &&
        r.months[r.lowestMonth - 1]?.closing === r.lowest &&
        r.months.slice(0, r.lowestMonth - 1).every((m) => m.closing > r.lowest);
      const values = [
        r.totalProfit,
        r.cashChange,
        r.gap,
        r.lowest,
        ...r.months.flatMap((m) => [m.profit, m.cashIn, m.cashOut, m.closing]),
      ];
      const clean = values.every((v) => Number.isSafeInteger(v) && !Object.is(v, -0));
      if (!ok || !clean) expect.fail(`identity broken for ${JSON.stringify(input)}`);
    }
    expect(n).toBe(10_000 + MONEY_EDGES.length ** 2 * DAY_EDGES.length ** 2);
  });
});

/* ------------------------------------------------------ F4-05 self-defence */

describe("F4-05 calculate defends itself", () => {
  const FIELD_KEYS = ["salesPence", "costsPence", "customerDays", "supplierDays", "openingPence"] as const;
  const CAP: Record<(typeof FIELD_KEYS)[number], number> = {
    salesPence: MONEY_MAX_PENCE,
    costsPence: MONEY_MAX_PENCE,
    customerDays: DAYS_MAX,
    supplierDays: DAYS_MAX,
    openingPence: MONEY_MAX_PENCE,
  };
  const bad = (key: (typeof FIELD_KEYS)[number]): [string, unknown][] => [
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["a negative", -1],
    ["a non-integer", 1.5],
    ["a value over its cap", CAP[key] + 1],
    ["a string", "100"],
    ["null", null],
    ["a bigint", 100n],
    ["undefined", undefined],
  ];
  const cases = FIELD_KEYS.flatMap((key) => [
    ...bad(key).map(([label, value]) => [`${key} ${label}`, { ...DEFAULT_INPUTS, [key]: value }] as const),
    [`${key} missing`, Object.fromEntries(Object.entries(DEFAULT_INPUTS).filter(([k]) => k !== key))] as const,
  ]);

  it.each(cases)("F4-05 throws for %s", (_name, input) => {
    let returned: unknown = "not called";
    expect(() => {
      returned = calculate(input as unknown as Inputs);
    }).toThrow(/./);
    expect(returned).toBe("not called");
    try {
      calculate(input as unknown as Inputs);
    } catch (e) {
      expect(e instanceof RangeError || e instanceof TypeError).toBe(true);
    }
  });

  it("F4-05 throws for a non-object", () => {
    expect(() => calculate(null as unknown as Inputs)).toThrow(TypeError);
    expect(() => calculate("x" as unknown as Inputs)).toThrow(TypeError);
  });

  it("F4-05 -0 is treated as 0", () => {
    const r = calculate({ salesPence: -0, costsPence: -0, customerDays: -0, supplierDays: -0, openingPence: -0 });
    expect(Object.is(r.lowest, 0)).toBe(true);
    expect(r.months.every((m) => Object.is(m.closing, 0) && Object.is(m.profit, 0))).toBe(true);
    expect(Object.is(r.totalProfit, 0) && Object.is(r.gap, 0) && Object.is(r.cashChange, 0)).toBe(true);
  });
});

/* -------------------------------------------------------- parse vectors */

type Expect = number | string;
const P: [string, "money" | "days", string, Expect][] = [
  ["P-01", "money", "20000", 2_000_000],
  ["P-02", "money", "20,000", 2_000_000],
  ["P-03", "money", "£20,000", 2_000_000],
  ["P-04", "money", "£ 20,000", 2_000_000],
  ["P-05", "money", "  20,000\t", 2_000_000],
  ["P-06", "money", "\u00a020000\u00a0", 2_000_000],
  ["P-07", "money", "1,000.5", 100_050],
  ["P-08", "money", "0.29", 29],
  ["P-09", "money", "1.15", 115],
  ["P-10", "money", "4.35", 435],
  ["P-11", "money", "007", 700],
  ["P-12", "money", "0", 0],
  ["P-13", "money", "10,000,000", 1_000_000_000],
  ["P-14", "money", "10000000.00", 1_000_000_000],
  ["P-15", "money", "", "blank"],
  ["P-16", "money", "   ", "blank"],
  ["P-17", "money", "£", "invalid"],
  ["P-18", "money", "-5", "negative"],
  ["P-19", "money", "\u22125", "negative"],
  ["P-20", "money", "-£5", "negative"],
  ["P-21", "money", "£-5", "negative"],
  ["P-22", "money", "-0", "negative"],
  ["P-23", "money", "(500)", "invalid"],
  ["P-24", "money", "+5", "invalid"],
  ["P-25", "money", "NaN", "invalid"],
  ["P-26", "money", "Infinity", "invalid"],
  ["P-27", "money", "-Infinity", "invalid"],
  ["P-28", "money", "1e6", "invalid"],
  ["P-29", "money", "1e309", "invalid"],
  ["P-30", "money", "0x10", "invalid"],
  ["P-31", "money", "1_000", "invalid"],
  ["P-32", "money", "12abc", "invalid"],
  ["P-33", "money", "12.500,00", "invalid"],
  ["P-34", "money", "10,00", "invalid"],
  ["P-35", "money", "1,0000", "invalid"],
  ["P-36", "money", ",100", "invalid"],
  ["P-37", "money", "1 000", "invalid"],
  ["P-38", "money", "1.000", "decimals"],
  ["P-39", "money", "1.005", "decimals"],
  ["P-40", "money", "12.", "invalid"],
  ["P-41", "money", ".5", "invalid"],
  ["P-42", "money", "１２", "invalid"],
  ["P-43", "money", "١٢", "invalid"],
  ["P-44", "money", "10,000,000.01", "overMax"],
  ["P-45", "money", "10000001", "overMax"],
  ["P-46", "money", "99999999999999999999", "overMax"],
  ["P-47", "money", "9".repeat(400), "overMax"],
  ["P-48", "money", "$100", "invalid"],
  ["P-49", "money", "100£", "invalid"],
  ["P-50", "money", "££100", "invalid"],
  ["P-51", "days", "30", 30],
  ["P-52", "days", " 30 ", 30],
  ["P-53", "days", "0", 0],
  ["P-54", "days", "180", 180],
  ["P-55", "days", "007", 7],
  ["P-56", "days", "", "blank"],
  ["P-57", "days", "181", "daysRange"],
  ["P-58", "days", "-1", "daysRange"],
  ["P-59", "days", "30.5", "notWhole"],
  ["P-60", "days", "30.0", "notWhole"],
  ["P-61", "days", "1e2", "invalid"],
  ["P-62", "days", "thirty", "invalid"],
  ["P-63", "days", "1,000", "invalid"],
  ["P-64", "days", "9".repeat(400), "daysRange"],
  ["P-65", "days", "30 days", "invalid"],
  ["P-66", "days", "Infinity", "invalid"],
];

const shown = (s: string) =>
  s.length > 24 ? `${JSON.stringify(s.slice(0, 8))}… (${s.length} chars)` : JSON.stringify(s);
const parse = (kind: "money" | "days", raw: string): Expect => {
  const r = kind === "money" ? parseMoney(raw) : parseDays(raw);
  if (!r.ok) return r.code;
  return "pence" in r ? r.pence : r.days;
};

describe("F4-07 / F4-08 parse vectors", () => {
  it("has all 66 vectors, 50 money and 16 days", () => {
    expect(P).toHaveLength(66);
    expect(P.filter((p) => p[1] === "money")).toHaveLength(50);
    expect(new Set(P.map((p) => p[0])).size).toBe(66);
  });
  it.each(
    P.map(
      ([id, kind, raw, want]) =>
        [
          `${kind === "money" ? "F4-07" : "F4-08"} ${id} ${kind} ${shown(raw)} → ${typeof want === "number" ? `${want}` : want}`,
          kind,
          raw,
          want,
        ] as const,
    ),
  )("%s", (_name, kind, raw, want) => {
    expect(parse(kind, raw)).toBe(want);
  });
});

describe("F4-09 to F4-12 parsing rules", () => {
  it("F4-09 P-15 blank sales is an error, not £0", () => {
    expect(parseMoney("")).toEqual({ ok: false, code: "blank" });
    const v = view({ ...DEFAULTS, sales: "" });
    expect(v.ok).toBe(false);
    expect(JSON.stringify(v)).not.toMatch(/NaN|Infinity|undefined|£0/);
    if (!v.ok) expect(v.errors).toEqual([{ id: "sales", code: "blank", message: "Enter monthly sales" }]);
  });
  it("F4-09 whitespace-only days are blank, and any blank field means no result", () => {
    expect(parseDays(" \t ")).toEqual({ ok: false, code: "blank" });
    for (const f of FIELDS) expect(view({ ...DEFAULTS, [f.id]: "  " }).ok, f.id).toBe(false);
  });
  it("F4-10 over-cap strings are errors on the digit string, never Infinity or a rounded number", () => {
    for (const s of [
      "9".repeat(400),
      "99999999999999999999",
      "10,000,000.01",
      "10000000.01",
      "0".repeat(300) + "10000001",
    ]) {
      expect(parseMoney(s), s.slice(0, 12)).toEqual({ ok: false, code: "overMax" });
    }
    expect(parseMoney("0".repeat(300) + "1")).toEqual({ ok: true, pence: 100 });
    expect(parseMoney("10,000,000")).toEqual({ ok: true, pence: MONEY_MAX_PENCE });
    expect(parseMoney("10000000.00")).toEqual({ ok: true, pence: MONEY_MAX_PENCE });
    expect(parseDays("0".repeat(300) + "180")).toEqual({ ok: true, days: 180 });
  });
  it("F4-11 other locales and number syntaxes are refused, not misread", () => {
    for (const s of [
      "12.500,00",
      "10,00",
      "1 000",
      "1e6",
      "0x10",
      "1_000",
      "Infinity",
      "NaN",
      "１２",
      "١٢",
      "1'000",
      "1.000.000",
    ]) {
      const r = parseMoney(s);
      expect(r.ok, s).toBe(false);
    }
    expect(parseMoney("1.000")).toEqual({ ok: false, code: "decimals" });
  });
  it("F4-12 the first failing rule wins: blank, invalid, decimals, negative, overMax", () => {
    expect(parseMoney("-1.005")).toEqual({ ok: false, code: "decimals" });
    expect(parseMoney("-99999999999")).toEqual({ ok: false, code: "negative" });
    expect(parseMoney("-£1,00")).toEqual({ ok: false, code: "invalid" });
    expect(parseMoney("-£-5")).toEqual({ ok: false, code: "invalid" });
    expect(parseDays("-1.5")).toEqual({ ok: false, code: "notWhole" });
    expect(parseDays("200.5")).toEqual({ ok: false, code: "notWhole" });
  });
  it("F4-12 every error code has its exact message from the copy table", () => {
    const money = FIELDS.find((f) => f.id === "sales");
    const days = FIELDS.find((f) => f.id === "customerDays");
    expect(money && days).toBeTruthy();
    if (!money || !days) return;
    expect(
      ["blank", "invalid", "decimals", "negative", "overMax"].map((c) => errorMessage("money", c, money.label)),
    ).toEqual([
      "Enter monthly sales",
      "Enter monthly sales in pounds, like 20,000 or 20,000.50",
      "Monthly sales can have up to 2 decimal places",
      "Monthly sales can't be negative",
      "Monthly sales must be £10,000,000 or less",
    ]);
    expect(["blank", "invalid", "notWhole", "daysRange"].map((c) => errorMessage("days", c, days.label))).toEqual([
      "Enter days your customers take to pay",
      "Enter days your customers take to pay as a whole number, like 30",
      "Days your customers take to pay must be a whole number",
      "Days your customers take to pay must be between 0 and 180",
    ]);
    expect(() => errorMessage("money", "notWhole", money.label)).toThrow();
    expect(() => errorMessage("days", "overMax", days.label)).toThrow();
  });
  it("F4-12 errors come one per field, in field order", () => {
    const v = view({ sales: "", costs: "-5", customerDays: "30.5", supplierDays: "181", opening: "1e6" });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.errors.map((e) => [e.id, e.code])).toEqual([
        ["sales", "blank"],
        ["costs", "negative"],
        ["customerDays", "notWhole"],
        ["supplierDays", "daysRange"],
        ["opening", "invalid"],
      ]);
    }
  });
  it("F4-16 the five labels and hints are the Q-5 copy", () => {
    expect(FIELDS.map((f) => [f.id, f.kind, f.label])).toEqual([
      ["sales", "money", "Monthly sales"],
      ["costs", "money", "Monthly costs"],
      ["customerDays", "days", "Days your customers take to pay"],
      ["supplierDays", "days", "Days you take to pay suppliers"],
      ["opening", "money", "Cash at the start"],
    ]);
    expect(FIELDS.every((f) => f.hint.length > 0)).toBe(true);
  });
});

/* ------------------------------------------------------- format vectors */

const G: [string, number, string][] = [
  ["G-01", 0, "£0"],
  ["G-02", 49, "£0"],
  ["G-03", 50, "£1"],
  ["G-04", 149, "£1"],
  ["G-05", 150, "£2"],
  ["G-06", 250, "£3"],
  ["G-07", -49, "£0"],
  ["G-08", -50, "-£1"],
  ["G-09", -250, "-£3"],
  ["G-10", 123_456_789, "£1,234,568"],
  ["G-11", 7_000_000_000, "£70,000,000"],
  ["G-12", -6_000_000_000, "-£60,000,000"],
];

describe("F4-13 format vectors", () => {
  it.each(G.map(([id, pence, want]) => [`${id} ${pence}p → ${want}`, pence, want] as const))(
    "F4-13 %s",
    (_n, pence, want) => {
      expect(formatGBP(pence)).toBe(want);
    },
  );
  it("F4-13 -0 is £0 and non-integer or unsafe pence throw", () => {
    expect(formatGBP(-0)).toBe("£0");
    for (const bad of [0.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])
      expect(() => formatGBP(bad)).toThrow(RangeError);
  });
  it("F4-14 S3-11 totals come from exact pence and are rounded once (£3, not £6)", () => {
    const r = calculate({ salesPence: 100_050, costsPence: 99_999, customerDays: 0, supplierDays: 0, openingPence: 0 });
    expect(r.months.map((m) => formatGBP(m.profit))).toEqual(Array(6).fill("£1"));
    expect(formatGBP(r.totalProfit)).toBe("£3");
  });
});

/* -------------------------------------------------------------- summary */

describe("F4-15 / F4-18 summary sentence", () => {
  const sentence = (r: S3Row) => summary(calculate(inputsOf(r)));
  const row = (id: string) => S3.find((r) => r.id === id) as S3Row;

  it("F4-18 S3-01 reads exactly as the AC example", () => {
    expect(sentence(row("S3-01"))).toBe(
      "Over 6 months, profit is £30,000 but cash rises by £5,000. Cash is lowest at -£5,000 in month 2, when it goes below zero.",
    );
  });
  it("F4-15 the below-zero phrase appears exactly when the lowest balance displays as negative", () => {
    for (const r of S3) expect(sentence(r).includes("goes below zero"), r.id).toBe(r.lowest.startsWith("-"));
    expect(sentence(row("S3-16"))).toBe(
      "Over 6 months, profit is -£3 and cash falls by £3. Cash is lowest at £0 in month 6.",
    );
  });
  it("F4-18 falls, rises, unchanged and the and/but joiner", () => {
    expect(sentence(row("S3-04"))).toBe(
      "Over 6 months, profit is -£12,000 but cash falls by £10,000. Cash is lowest at -£5,000 in month 6, when it goes below zero.",
    );
    expect(sentence(row("S3-03"))).toBe(
      "Over 6 months, profit is £30,000 and cash rises by £30,000. Cash is lowest at £15,000 in month 1.",
    );
    expect(sentence(row("S3-05"))).toBe(
      "Over 6 months, profit is £0 and cash ends where it started. Cash is lowest at £0 in month 1.",
    );
  });
  it("F4-15 moneySegments marks each amount as one unit and joins back to the same sentence", () => {
    expect(moneySegments(sentence(row("S3-04")))).toEqual([
      { text: "Over 6 months, profit is ", money: false },
      { text: "-£12,000", money: true },
      { text: " but cash falls by ", money: false },
      { text: "£10,000", money: true },
      { text: ". Cash is lowest at ", money: false },
      { text: "-£5,000", money: true },
      { text: " in month 6, when it goes below zero.", money: false },
    ]);
    for (const r of S3) {
      const parts = moneySegments(sentence(r));
      expect(parts.map((p) => p.text).join(""), r.id).toBe(sentence(r));
      // Every amount is whole, sign included, and nothing else is marked as money.
      for (const p of parts.filter((x) => x.money)) expect(p.text, r.id).toMatch(/^-?£\d{1,3}(,\d{3})*$/);
      expect(
        parts.filter((x) => !x.money).some((x) => /£|-£/.test(x.text)),
        r.id,
      ).toBe(false);
    }
    expect(moneySegments("-£10,000,000.")).toEqual([
      { text: "-£10,000,000", money: true },
      { text: ".", money: false },
    ]);
    expect(moneySegments("Results not updated. 2 answers need fixing.")).toEqual([
      { text: "Results not updated. 2 answers need fixing.", money: false },
    ]);
  });
  it("F4-18 the error-count sentence", () => {
    expect(errorCountSentence(1)).toBe("Results not updated. 1 answer needs fixing.");
    expect(errorCountSentence(2)).toBe("Results not updated. 2 answers need fixing.");
  });
  it("F4-35 / F4-41 fixed copy", () => {
    expect(NOJS_NOTE).toBe("To change these figures, turn on JavaScript. The worked example uses the default values.");
    expect(DISCLAIMER).toBe(
      "Illustrative example only. It isn't financial advice and uses no current tax rates or official values.",
    );
  });
});

describe("F4-39 defaults", () => {
  it("F4-39 DEFAULTS parse to DEFAULT_INPUTS and give S3-01", () => {
    expect(DEFAULTS).toEqual({
      sales: "£20,000",
      costs: "£15,000",
      customerDays: "60",
      supplierDays: "30",
      opening: "£10,000",
    });
    expect(parseMoney(DEFAULTS.sales)).toEqual({ ok: true, pence: DEFAULT_INPUTS.salesPence });
    expect(parseMoney(DEFAULTS.costs)).toEqual({ ok: true, pence: DEFAULT_INPUTS.costsPence });
    expect(parseDays(DEFAULTS.customerDays)).toEqual({ ok: true, days: DEFAULT_INPUTS.customerDays });
    expect(parseDays(DEFAULTS.supplierDays)).toEqual({ ok: true, days: DEFAULT_INPUTS.supplierDays });
    expect(parseMoney(DEFAULTS.opening)).toEqual({ ok: true, pence: DEFAULT_INPUTS.openingPence });
    const v = view(DEFAULTS);
    expect(v.ok && v.rows.map((r) => r.closing)).toEqual(S3[0]?.closing);
  });
});
