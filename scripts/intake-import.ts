// F5-51: import an intake artifact into the working tree, checked like the visual baselines.
//
//   npm run intake:import -- --artifact <id>    download with `gh api` (read-only), then import
//   npm run intake:import -- <artifact.zip>     import a zip you already downloaded
//   npm run intake:import -- --dry-run <zip>    check only, write nothing
//   npm run intake:verify -- <dir> [--registry <dir>]
//                                               check an intake output folder (the workflow, before upload);
//                                               --registry is the Source folder intake read (default content/sources)
//
// The zip is read as data in a mktemp -d folder outside the repo, removed on exit. Every
// entry is checked (F5-40 names, regular files, ARTIFACT_LIMITS, schemas, F5-33 diff)
// before anything is copied into content/. Nothing from the artifact is executed or
// installed, and nothing is committed: review the diff, then commit it yourself.
// Exit codes: 0 ok, 1 the artifact failed a check, 2 usage.
import { execFileSync } from "node:child_process";
import { lstatSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { ArtifactError } from "./intake-artifact.ts";
import { ImportError, ZIP_MAX_BYTES, runImport, type ImportOptions } from "./intake-queue.ts";

const usage =
  "usage: intake-import.ts [--dry-run] (--artifact <id> | <artifact.zip>) | --verify <dir> [--registry <dir>]";
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const rest = args.filter((a) => a !== "--dry-run");
const repo = realpathSync(process.cwd());
let cleanup: string | undefined;
const exit = (code: number, msg?: string): never => {
  if (msg) console.error(msg);
  if (cleanup) rmSync(cleanup, { recursive: true, force: true });
  process.exit(code);
};

let opts: ImportOptions;
if (rest[0] === "--verify" && !dryRun && (rest.length === 2 || (rest.length === 4 && rest[2] === "--registry"))) {
  opts = { repo, fromDir: rest[1] ?? "", dryRun: true };
  if (rest.length === 4) {
    // The registry must be a real folder inside this checkout (the fixture registry in the workflow).
    let reg = "";
    try {
      reg = realpathSync(rest[3] ?? "");
    } catch {
      exit(2, "--registry folder does not exist");
    }
    if (!reg.startsWith(`${repo}${sep}`) || !lstatSync(reg).isDirectory())
      exit(2, "--registry must be a folder inside the repo");
    opts.sourcesDir = reg;
  }
} else if (rest[0] === "--artifact" && rest.length === 2) {
  const id = rest[1] ?? "";
  if (!/^\d{1,20}$/.test(id)) exit(2, "--artifact takes the numeric artifact id");
  const slug =
    process.env["GITHUB_REPOSITORY"] ??
    execFileSync("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"], {
      encoding: "utf8",
    }).trim();
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(slug)) exit(2, "could not tell which repository to download from");
  cleanup = mkdtempSync(join(realpathSync(tmpdir()), "intake-download-"));
  let zip: Buffer = Buffer.alloc(0);
  try {
    zip = execFileSync("gh", ["api", `repos/${slug}/actions/artifacts/${id}/zip`], {
      maxBuffer: ZIP_MAX_BYTES + 1,
    });
  } catch {
    exit(1, "download failed (gh api): nothing written");
  }
  if (zip.length > ZIP_MAX_BYTES) exit(1, `artifact is over ${ZIP_MAX_BYTES} bytes`);
  writeFileSync(join(cleanup, "artifact.zip"), zip, { flag: "wx", mode: 0o600 });
  opts = { repo, zip: join(cleanup, "artifact.zip"), dryRun };
} else if (rest.length === 1 && !rest[0]?.startsWith("-")) {
  opts = { repo, zip: rest[0] ?? "", dryRun };
} else {
  exit(2, usage);
  throw new Error("unreachable");
}

try {
  const plan = runImport(opts);
  if (opts.fromDir !== undefined) console.log(`intake queue OK: ${plan.writes.length} file(s) checked`);
  else if (dryRun) console.log("dry run: nothing written");
  else {
    const changed = plan.writes.filter((w) => w.action !== "unchanged").map((w) => w.name);
    console.log(`\ncopied ${changed.length} file(s) into the working tree. Nothing was committed. Review, then:`);
    if (changed.length > 0) console.log(`  git add -- ${changed.join(" ")}`);
    console.log("\nsummary.txt (paste into the review PR body):\n" + plan.summary);
  }
  exit(0);
} catch (e) {
  if (e instanceof ArtifactError) exit(1, `artifact rejected, nothing written: ${e.message}`);
  if (e instanceof ImportError)
    exit(1, `artifact rejected, nothing written (${e.code}):\n  ${e.problems.join("\n  ")}`);
  throw e;
}
