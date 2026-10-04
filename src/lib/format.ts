/** Display helpers shared by F2 components. Dates are calendar dates, so UTC. */
const GB_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** "2 October 2026" */
export function formatDateGB(date: Date): string {
  return GB_DATE.format(date);
}

/** "2026-10-02", for <time datetime>. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "how-to" -> "How to" */
export function labelOf(value: string): string {
  const s = value.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export const JURISDICTION_LABELS: Record<string, string> = {
  UK: "United Kingdom",
  IE: "Ireland",
  EU: "European Union",
  US: "United States",
  other: "Other jurisdiction",
};
