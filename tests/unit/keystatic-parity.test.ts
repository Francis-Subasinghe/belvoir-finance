/**
 * F3-27: Keystatic (keystatic.config.ts) and the Zod schemas
 * (src/content/schemas.ts) describe the same fields, enums, references and
 * defaults. `parityProblems` is checked on the real config and on three
 * deliberately broken copies, so the check itself is tested.
 */
import { fields } from "@keystatic/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import ks from "../../keystatic.config";
import { COLLECTIONS, type CollectionName, FORMATS } from "../../src/content/schemas";
import { REFERENCES } from "../../src/lib/content-rules";

/* eslint-disable @typescript-eslint/no-explicit-any -- walking two libraries' internal field shapes */
type AnyField = any;
type AnyZod = any;

/**
 * Defaults that are allowed to differ, each with its reason. Zod has no default
 * for these required booleans; a Keystatic checkbox can't be "unset", and
 * Keystatic always writes the value to the file, so nothing is silently
 * defaulted at build time (F3-20).
 */
const DEFAULT_EXCEPTIONS: Record<string, unknown> = {
  // Pre-ticked fail-safe: a new entry is demo unless the editor unticks it (F3-20).
  demo: true,
  // A checkbox starts unticked; the file always records true or false.
  factual: false,
  commercialInterest: false,
};

function unwrap(s: AnyZod): { inner: AnyZod; optional: boolean; def: unknown; hasDefault: boolean } {
  let optional = false;
  let hasDefault = false;
  let def: unknown;
  let cur = s;
  for (;;) {
    const t = cur?.def?.type;
    if (t === "optional" || t === "nullable") {
      optional = true;
      cur = cur.def.innerType;
    } else if (t === "default") {
      hasDefault = true;
      def = typeof cur.def.defaultValue === "function" ? cur.def.defaultValue() : cur.def.defaultValue;
      cur = cur.def.innerType;
    } else if (t === "pipe") {
      cur = cur.def.in;
    } else return { inner: cur, optional, def, hasDefault };
  }
}

const zodEnumValues = (s: AnyZod): string[] | undefined => {
  const { inner } = unwrap(s);
  if (inner?.def?.type === "enum") return Object.values(inner.def.entries) as string[];
  if (inner?.def?.type === "array") return zodEnumValues(inner.def.element);
  return undefined;
};

const relationshipTarget = (f: AnyField): string | undefined => {
  if (f?.kind !== "form" || f.options) return undefined;
  try {
    return f.Input({})?.props?.collection;
  } catch {
    return undefined;
  }
};

const keystaticDefault = (f: AnyField): unknown => {
  try {
    return f.defaultValue?.();
  } catch {
    return undefined;
  }
};

export function parityProblems(
  name: CollectionName,
  ksSchema: Record<string, AnyField>,
  zodSchema: AnyZod,
  refs: readonly { from: string; field: string; to: string }[] = REFERENCES,
): string[] {
  const out: string[] = [];
  const shape: Record<string, AnyZod> = zodSchema.shape;
  const ksKeys = Object.keys(ksSchema)
    .filter((k) => !(name === "stories" && k === "body"))
    .sort();
  const zKeys = Object.keys(shape).sort();
  for (const k of zKeys) if (!ksKeys.includes(k)) out.push(`${name}.${k}: in Zod, missing in Keystatic`);
  for (const k of ksKeys) if (!zKeys.includes(k)) out.push(`${name}.${k}: in Keystatic, missing in Zod`);

  for (const k of zKeys.filter((key) => ksKeys.includes(key))) {
    const f = ksSchema[k];
    const z0 = shape[k];
    // Enums: select / multiselect options equal the Zod enum, in order.
    const zEnum = zodEnumValues(z0);
    if (zEnum) {
      const opts: string[] | undefined = f.options?.map((o: { value: string }) => o.value);
      if (!opts) out.push(`${name}.${k}: Zod enum but Keystatic field is not a select`);
      else if (JSON.stringify(opts) !== JSON.stringify(zEnum))
        out.push(`${name}.${k}: options ${JSON.stringify(opts)} != enum ${JSON.stringify(zEnum)}`);
    }
    // Defaults.
    const { hasDefault, def } = unwrap(z0);
    const kd = keystaticDefault(f);
    if (k in DEFAULT_EXCEPTIONS) {
      if (kd !== DEFAULT_EXCEPTIONS[k]) out.push(`${name}.${k}: expected the documented exception default`);
    } else if (hasDefault && f.kind === "form" && JSON.stringify(kd) !== JSON.stringify(def)) {
      out.push(`${name}.${k}: Keystatic default ${JSON.stringify(kd)} != Zod default ${JSON.stringify(def)}`);
    }
  }

  // References: every reference is a relationship picker to the right collection.
  for (const r of refs.filter((x) => x.from === name)) {
    const [top, sub] = r.field.split("[].");
    let f = ksSchema[top ?? ""];
    if (f?.kind === "array") f = f.element;
    if (sub) f = f?.fields?.[sub];
    const target = relationshipTarget(f);
    if (target !== r.to)
      out.push(`${name}.${r.field}: should be a relationship to ${r.to} (got ${target ?? "no picker"})`);
  }
  return out;
}

const collections = (ks as any).collections as Record<CollectionName, { schema: Record<string, AnyField> }>;

describe("F3-27 Keystatic parity", () => {
  it("F3-27 Keystatic and Zod define the same seven collections", () => {
    expect(Object.keys(collections).sort()).toEqual(Object.keys(COLLECTIONS).sort());
  });

  it.each(Object.keys(COLLECTIONS) as CollectionName[])(
    "F3-27 %s: keys, enums, references and defaults match",
    (name) => {
      expect(parityProblems(name, collections[name].schema, COLLECTIONS[name].schema)).toEqual([]);
    },
  );

  it("F3-27 the F3 fields are present on both sides, and Person has no placeholder", () => {
    const has = (c: CollectionName, k: string) =>
      k in collections[c].schema && k in (COLLECTIONS[c].schema as AnyZod).shape;
    for (const k of ["factual", "commercialInterest", "jurisdictionNote", "demo"])
      expect(has("stories", k), k).toBe(true);
    for (const c of ["topics", "tools", "people", "sources"] as const) expect(has(c, "demo"), c).toBe(true);
    expect(has("sources", "jurisdictionNote")).toBe(true);
    expect("placeholder" in collections.people.schema).toBe(false);
    expect("placeholder" in (COLLECTIONS.people.schema as AnyZod).shape).toBe(false);
  });

  it("F3-27 negative: an extra Zod field fails the check", () => {
    const extended = (COLLECTIONS.topics.schema as AnyZod).extend({ extra: z.string() });
    expect(parityProblems("topics", collections.topics.schema, extended)).toContain(
      "topics.extra: in Zod, missing in Keystatic",
    );
  });

  it("F3-27 negative: an enum with an extra value fails the check", () => {
    const extended = z.strictObject({
      ...(COLLECTIONS.stories.schema as AnyZod).shape,
      format: z.enum([...FORMATS, "podcast"]),
    });
    expect(parityProblems("stories", collections.stories.schema, extended).join("\n")).toMatch(
      /stories\.format: options/,
    );
  });

  it("F3-27 negative: a reference left as fields.text fails the check", () => {
    const broken = { ...collections.topics.schema, featuredTool: fields.text({ label: "Featured tool" }) };
    expect(parityProblems("topics", broken, COLLECTIONS.topics.schema)).toContain(
      "topics.featuredTool: should be a relationship to tools (got no picker)",
    );
  });

  it("F3-27 Keystatic stays local-only", () => {
    expect((ks as any).storage).toEqual({ kind: "local" });
  });
});
