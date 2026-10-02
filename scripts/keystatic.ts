// `npm run keystatic`: local-only Keystatic admin at http://127.0.0.1:4321/keystatic
// Cross-platform (no shell env syntax). Binds to 127.0.0.1 via astro.config.mjs.
import { spawn } from "node:child_process";

const child = spawn("npx", ["astro", "dev"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, BELVOIR_KEYSTATIC: "1" },
});
child.on("exit", (code) => process.exit(code ?? 0));
