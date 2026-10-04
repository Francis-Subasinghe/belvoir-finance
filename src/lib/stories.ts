/**
 * Publication filter (F1-13): only `published` entries are ever built or
 * listed. Pages must get stories through these helpers, never getCollection
 * directly.
 */
export interface HasStatus {
  data: { status: string };
}

export function isPublished<T extends HasStatus>(entry: T): boolean {
  return entry.data.status === "published";
}

export function onlyPublished<T extends HasStatus>(entries: readonly T[]): T[] {
  return entries.filter(isPublished);
}
