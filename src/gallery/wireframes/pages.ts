/** D12 low-fidelity wireframes: the 7 sitemap templates (SITEMAP_AND_JOURNEYS.md). Dev and tests only. */
export const WIREFRAMES = [
  { slug: "home", label: "Home", path: "/" },
  { slug: "explore", label: "Explore", path: "/explore" },
  { slug: "topic", label: "Topic", path: "/topics/<slug>" },
  { slug: "story", label: "Story", path: "/stories/<slug>" },
  { slug: "tools", label: "Tools directory", path: "/tools" },
  { slug: "tool", label: "Tool page", path: "/tools/cash-vs-profit" },
  { slug: "sources", label: "Source library", path: "/sources" },
] as const;

export type WireframeSlug = (typeof WIREFRAMES)[number]["slug"];
