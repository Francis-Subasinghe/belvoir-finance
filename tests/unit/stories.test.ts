import { describe, expect, it } from "vitest";
import { STATUSES } from "../../src/content/schemas";
import { onlyPublished } from "../../src/lib/stories";

describe("F1-13 publication filter", () => {
  it("keeps only published entries", () => {
    const entries = STATUSES.map((status) => ({ id: status, data: { status } }));
    expect(onlyPublished(entries).map((e) => e.id)).toEqual(["published"]);
  });
});
