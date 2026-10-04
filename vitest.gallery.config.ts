import { defineConfig } from "vitest/config";

// Assertions on the gallery test build in dist-gallery/ (F2-01, F2-08, F2-33,
// F2-34, F2-40 negative check). Run by `npm run build:gallery`.
export default defineConfig({
  test: {
    include: ["tests/gallery/**/*.test.ts"],
    environment: "node",
  },
});
