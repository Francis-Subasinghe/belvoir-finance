import { getViteConfig } from "astro/config";

export default getViteConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // F5-41: fetch, DNS and socket connects throw in every test.
    setupFiles: ["tests/helpers/no-network.ts"],
  },
});
