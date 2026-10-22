// F5-51: the ONE place the import reaches the schemas. Every JSON entry is checked against
// `sourceItemSchema` and every YAML entry against `sourceSchema`, both from Forge's
// src/lib/sources/schema.ts. There is deliberately no fallback or stub: if that module or
// either export is missing, the import fails closed with `schema-unavailable`.
//
// NOT READY: written against the export names in AC F5-51. Rebase onto Forge's head and
// confirm the names (and swap the dynamic import for a static one) before this ships.
import { pathToFileURL } from "node:url";
import { join } from "node:path";

export const SCHEMA_MODULE = "src/lib/sources/schema.ts";

/** Each returns the schema problems for one parsed entry ([] when it passes). */
export interface EntryValidators {
  item(value: unknown): string[];
  source(value: unknown): string[];
}

interface SafeParser {
  safeParse(
    v: unknown,
  ): { success: true } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}
const isParser = (v: unknown): v is SafeParser =>
  typeof v === "object" && v !== null && typeof (v as { safeParse?: unknown }).safeParse === "function";

export class SchemaUnavailableError extends Error {
  readonly code = "schema-unavailable";
}

function problems(schema: SafeParser, value: unknown): string[] {
  const r = schema.safeParse(value);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.map(String).join(".") || "(root)"}: ${i.message}`);
}

/** Load the real schemas from `<repo>/src/lib/sources/schema.ts`. */
export async function loadValidators(repo: string): Promise<EntryValidators> {
  let mod: Record<string, unknown>;
  try {
    mod = (await import(pathToFileURL(join(repo, SCHEMA_MODULE)).href)) as Record<string, unknown>;
  } catch (e) {
    throw new SchemaUnavailableError(
      `schema-unavailable: ${SCHEMA_MODULE} could not be imported (${(e as Error).message.split("\n")[0]})`,
    );
  }
  const item = mod["sourceItemSchema"];
  const source = mod["sourceSchema"];
  if (!isParser(item) || !isParser(source))
    throw new SchemaUnavailableError(
      `schema-unavailable: ${SCHEMA_MODULE} must export sourceItemSchema and sourceSchema`,
    );
  return { item: (v) => problems(item, v), source: (v) => problems(source, v) };
}
