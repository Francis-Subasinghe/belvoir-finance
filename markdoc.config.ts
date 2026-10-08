import { component, defineMarkdocConfig, nodes } from "@astrojs/markdoc/config";
import { allowedTags } from "./src/lib/markdoc-allowlist";

export default defineMarkdocConfig({
  tags: {
    callout: {
      ...allowedTags.callout,
      render: component("./src/components/markdoc/Callout.astro"),
    },
    // V1-54: strict schema (self-closing, five attributes, finite numbers, <= 12 points).
    chart: {
      ...allowedTags.chart,
      render: component("./src/components/markdoc/Chart.astro"),
    },
  },
  nodes: {
    // Every Markdoc link goes through the safe-link helper.
    link: {
      ...nodes.link,
      render: component("./src/components/markdoc/Link.astro"),
    },
  },
});
