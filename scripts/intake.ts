// Usage: npm run intake -- --fixtures <dir> --out <dir> [--fetched-at <RFC 3339>]
// F5 runs on fixtures only (F5-53): <dir>/registry/*.yaml is the registry and
// <dir>/net/script.json scripts DNS and HTTP. Live mode needs the explicit
// --live flag, which no workflow step uses in F5. Prints only the summary.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fixtureNet } from "../src/lib/intake/fixture-net.ts";
import { type ExistingItem, type RegistryFile, runIntake } from "../src/lib/intake/run.ts";
import { parseOffsetDateTime } from "../src/lib/sources/schema.ts";

export const FIXTURE_FETCHED_AT = "2026-10-23T00:00:00Z";

export interface Io {
  out: (s: string) => void;
  err: (s: string) => void;
}

function readRegistry(dir: string): RegistryFile[] {
  return readdirSync(dir)
    .filter((n) => n.endsWith(".yaml"))
    .map((n) => ({ id: n.slice(0, -5), text: readFileSync(join(dir, n), "utf8") }));
}
function readExisting(dir: string): ExistingItem[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .map((n) => JSON.parse(readFileSync(join(dir, n), "utf8")) as ExistingItem);
}

export async function main(argv: string[], env: Record<string, string | undefined>, io: Io): Promise<number> {
  const arg = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const fixtures = arg("--fixtures");
  const out = arg("--out");
  const live = argv.includes("--live");
  if (!out) {
    io.err("intake: --out <dir> is required\n");
    return 2;
  }
  if (existsSync(out) && readdirSync(out).length > 0) {
    io.err("intake: --out must be a new or empty directory\n");
    return 2;
  }
  if (live === (fixtures !== undefined)) {
    io.err("intake: choose --fixtures <dir>, or the explicit --live (not used by any workflow in F5)\n");
    return 2;
  }
  // Fixture runs use a fixed instant, so they are reproducible (F5-45). A live run
  // must say when it ran; scripts/ never read the clock (F3-51).
  const fetchedAt = arg("--fetched-at") ?? (live ? undefined : FIXTURE_FETCHED_AT);
  if (fetchedAt === undefined) {
    io.err("intake: --live needs --fetched-at <RFC 3339 date-time>\n");
    return 2;
  }
  if (!parseOffsetDateTime(fetchedAt)) {
    io.err("intake: --fetched-at must be an RFC 3339 date-time with an offset\n");
    return 2;
  }
  let deps;
  let registryDir: string;
  if (fixtures !== undefined) {
    const net = fixtureNet(join(fixtures, "net", "script.json"));
    deps = { resolver: net.resolver, transport: net.transport };
    registryDir = join(fixtures, "registry");
  } else {
    const { liveResolver, makeLiveTransport } = await import("../src/lib/intake/live.ts");
    deps = { resolver: liveResolver, transport: makeLiveTransport() };
    registryDir = "content/sources";
  }
  const existingDir = fixtures !== undefined ? join(fixtures, "existing-items") : "content/source-items";
  const r = await runIntake({
    ...deps,
    registry: readRegistry(registryDir),
    existing: readExisting(existingDir),
    outDir: out,
    fetchedAt,
    env,
  });
  io.out(r.summary);
  return r.exitCode;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const code = await main(process.argv.slice(2), process.env, {
    out: (s) => process.stdout.write(s),
    err: (s) => process.stderr.write(s),
  });
  process.exit(code);
}
