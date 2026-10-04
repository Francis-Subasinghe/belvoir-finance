// F2 component gallery (dev and tests only; never in dist/, F2-40).
//   node scripts/gallery.ts dev      -> http://127.0.0.1:4322/belvoir-finance/design/
//   node scripts/gallery.ts build    -> dist-gallery/ (gitignored, never deployed)
//   node scripts/gallery.ts preview  -> serves dist-gallery/ on 127.0.0.1:4322
// Cross-platform (no shell env syntax). Host and port come from astro.config.mjs.
import { spawn } from "node:child_process";

const mode = process.argv[2];
if (mode !== "dev" && mode !== "build" && mode !== "preview") {
  console.error("usage: node scripts/gallery.ts <dev|build|preview>");
  process.exit(2);
}
// --ignore-lock: Astro 7 allows one tracked dev/preview server per project;
// the gallery runs alongside the site's own server on its own port (4322).
const args = mode === "build" ? ["astro", "build"] : ["astro", mode, "--ignore-lock"];
const child = spawn("npx", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, BELVOIR_GALLERY: "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));
