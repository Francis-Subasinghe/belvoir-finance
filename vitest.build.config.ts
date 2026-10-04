import { defineConfig } from "vitest/config";

// Assertions on the built site in dist/. Run after `npm run build`.
export default defineConfig({
  test: {
    include: ["tests/build/**/*.test.ts"],
    environment: "node",
  },
});
