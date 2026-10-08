/**
 * F4-53 (D-10): the one tool → icon mapping, used by Home, /tools/, the tool
 * page and the topic-page tools card (through ToolIcon.astro). A tool with no
 * entry shows no icon.
 */
export const TOOL_ICONS: Readonly<Record<string, "cash-vs-profit">> = {
  "cash-vs-profit": "cash-vs-profit",
};

export function toolIcon(id: string): "cash-vs-profit" | undefined {
  return Object.hasOwn(TOOL_ICONS, id) ? TOOL_ICONS[id] : undefined;
}
