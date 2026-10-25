import { defineConfig } from "vitest/config";

// Assertions on the built site in dist/. Run after `npm run build`.
export default defineConfig({
  test: {
    include: ["tests/build/**/*.test.ts"],
    environment: "node",
    // F5-41: fetch, DNS and socket connects throw in every test.
    setupFiles: ["tests/helpers/no-network.ts"],
  },
});
