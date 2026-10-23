import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

type Update = {
  "package-ecosystem": string;
  directory: string;
  groups?: Record<string, { patterns?: string[] }>;
  ignore?: { "dependency-name": string; "update-types"?: string[] }[];
};
const config = parse(readFileSync(".github/dependabot.yml", "utf8")) as { updates: Update[] };

// Dependabot patterns: `*` matches any run of characters (including `/`).
const matches = (pattern: string, name: string): boolean =>
  new RegExp(
    `^${pattern
      .split("*")
      .map((p) => p.replace(/[.+?^${}()|[\]\\/]/g, "\\$&"))
      .join(".*")}$`,
  ).test(name);

describe("dependabot config", () => {
  const actions = config.updates.filter((u) => u["package-ecosystem"] === "github-actions");

  it("has one github-actions entry with a codeql-action group", () => {
    expect(actions).toHaveLength(1);
    expect(actions[0]?.groups?.["codeql-action"]?.patterns?.length).toBeGreaterThan(0);
  });

  it("groups every github/codeql-action sub-action and nothing else", () => {
    const patterns = actions[0]?.groups?.["codeql-action"]?.patterns ?? [];
    for (const name of [
      "github/codeql-action/init",
      "github/codeql-action/analyze",
      "github/codeql-action/upload-sarif",
      "github/codeql-action/autobuild",
    ]) {
      expect(
        patterns.some((p) => matches(p, name)),
        name,
      ).toBe(true);
    }
    for (const name of ["actions/checkout", "actions/setup-node", "actions/upload-artifact"]) {
      expect(
        patterns.some((p) => matches(p, name)),
        name,
      ).toBe(false);
    }
  });

  it("keeps the @types/node semver-major ignore on the root npm entry", () => {
    const npm = config.updates.find((u) => u["package-ecosystem"] === "npm" && u.directory === "/");
    expect(npm?.ignore).toContainEqual({
      "dependency-name": "@types/node",
      "update-types": ["version-update:semver-major"],
    });
  });
});
