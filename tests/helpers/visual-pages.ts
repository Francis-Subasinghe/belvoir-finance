/**
 * F3-41: the pages the visual suite screenshots, and the full snapshot set it
 * must produce. Shared by tests/visual/pages.visual.ts and the
 * check:visual-tests guard (scripts/check-visual-tests.ts), so a regenerated
 * baseline set can't silently be partial.
 */
export const VISUAL_PROJECTS = ["visual-360", "visual-768", "visual-1280"] as const;

export const VISUAL_PAGES: readonly (readonly [name: string, path: string])[] = [
  ["page-home", ""],
  ["page-explore", "explore/"],
  ["page-stories", "stories/"],
  ["page-topic", "topics/understand-the-numbers/"],
  ["page-story", "stories/why-profit-isnt-cash/"],
  ["page-person", "people/placeholder-author/"],
  ["page-tools", "tools/"],
  ["page-tool", "tools/cash-vs-profit/"],
  ["page-sources", "sources/"],
];

/** Snapshot names (without project or platform) the visual specs take: the gallery plus each page. */
export const VISUAL_SNAPSHOTS: readonly string[] = ["gallery", ...VISUAL_PAGES.map(([n]) => n)];

/** Every baseline path a full regeneration on linux must contain. */
export const expectedBaselinePaths = (): string[] =>
  VISUAL_PROJECTS.flatMap((p) =>
    VISUAL_SNAPSHOTS.map((s) => `tests/visual/__screenshots__/${p}/${s}-linux.png`),
  ).sort();
