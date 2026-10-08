/**
 * F3-41: the pages the visual suite screenshots, and the full snapshot set it
 * must produce. Shared by tests/visual/pages.visual.ts, the check:visual-tests
 * guard (scripts/check-visual-tests.ts) and the check:visual-baselines coverage
 * check (scripts/check-visual-baselines.ts), so neither a regenerated nor a
 * committed baseline set can silently be partial or carry extras.
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

/**
 * F4-55: the two explorer states with their own snapshot (pages.visual.ts):
 * `tool-errors` after committing one bad value per field, and `tool-nojs`
 * with JavaScript off. `page-tool` stays the default, enhanced state.
 */
export const VISUAL_TOOL_STATES = ["tool-errors", "tool-nojs"] as const;

/** F4-55: the values committed for `tool-errors` (blank, negative, notWhole, daysRange, invalid). */
export const TOOL_ERROR_VALUES = {
  sales: "",
  costs: "-5",
  customerDays: "30.5",
  supplierDays: "181",
  opening: "1e6",
} as const;

/** Snapshot names (without project or platform) the visual specs take: the gallery, each page and the tool states. */
export const VISUAL_SNAPSHOTS: readonly string[] = ["gallery", ...VISUAL_PAGES.map(([n]) => n), ...VISUAL_TOOL_STATES];

/** Every baseline path a full regeneration on linux must contain. */
export const expectedBaselinePaths = (): string[] =>
  VISUAL_PROJECTS.flatMap((p) =>
    VISUAL_SNAPSHOTS.map((s) => `tests/visual/__screenshots__/${p}/${s}-linux.png`),
  ).sort();
