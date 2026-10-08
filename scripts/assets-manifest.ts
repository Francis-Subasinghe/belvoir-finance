// Usage: node scripts/assets-manifest.ts   (Node's built-in TypeScript support)
// V1-02: rewrites src/assets/assets.json from the files under src/assets/,
// keeping each row's provenance and refreshing its sha256. A new file gets a
// row from its folder (icons/, pillars/, hero, diagram-*); review the diff.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const DIR = "src/assets";
const MANIFEST = `${DIR}/assets.json`;
const LICENCE = "Original work for Belvoir Finance, all rights reserved";

interface Row {
  path: string;
  kind: string;
  cap: string;
  idPrefix: string;
  author: string;
  method: string;
  licence: string;
  sha256: string;
}

const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const old = new Map<string, Row>(
  existsSync(MANIFEST)
    ? (JSON.parse(readFileSync(MANIFEST, "utf8")) as { assets: Row[] }).assets.map((r) => [r.path, r])
    : [],
);
const rows = walk(DIR)
  .filter((p) => p.endsWith(".svg"))
  .sort()
  .map((path): Row => {
    const name = basename(path, ".svg");
    const [kind, cap, prefix] = path.includes("/icons/")
      ? ["icon", "icon", `icon-${name}-`]
      : path.includes("/pillars/")
        ? ["illustration", "illustration", `pillar-${name}-`]
        : name === "hero"
          ? ["illustration", "hero", "hero-"]
          : ["diagram", "diagram", `${name}-`];
    const base = old.get(path) ?? {
      path,
      kind,
      cap,
      idPrefix: prefix,
      author: "Forge (bot)",
      method: "hand-authored SVG",
      licence: LICENCE,
      sha256: "",
    };
    return { ...base, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") };
  });
writeFileSync(MANIFEST, `${JSON.stringify({ assets: rows }, null, 2)}\n`);
console.log(`${MANIFEST}: ${rows.length} assets`);
