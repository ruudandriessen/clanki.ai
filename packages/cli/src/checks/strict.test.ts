import { describe, expect, test } from "bun:test";

import { assertStrictGroupCoverage } from "./strict";
import type { GroupSummary } from "../functions/run/models/report";

describe("assertStrictGroupCoverage", () => {
  test("does not throw when all source files are grouped and all config members match", () => {
    const sourceFiles = ["src/a.ts", "src/b.ts"];
    const groups = [moduleGroup("app", sourceFiles)];

    expect(() => assertStrictGroupCoverage(sourceFiles, groups)).not.toThrow();
  });

  test("throws when source files are ungrouped", () => {
    const sourceFiles = ["src/a.ts", "src/b.ts"];
    const groups = [moduleGroup("app", ["src/a.ts"])];

    expect(() => assertStrictGroupCoverage(sourceFiles, groups)).toThrow(
      "1 source file(s) are not part of any group",
    );
    expect(() => assertStrictGroupCoverage(sourceFiles, groups)).toThrow("src/b.ts");
  });

  test("throws when module include patterns are unmatched", () => {
    const sourceFiles = ["src/a.ts"];
    const groups = [
      moduleGroup("app", sourceFiles, [{ kind: "include-pattern", value: "src/missing/**/*.ts" }]),
    ];

    expect(() => assertStrictGroupCoverage(sourceFiles, groups)).toThrow(
      "configured member(s) matched nothing",
    );
    expect(() => assertStrictGroupCoverage(sourceFiles, groups)).toThrow(
      "include-pattern: src/missing/**/*.ts",
    );
  });

  test("throws when data-structure type references are unmatched", () => {
    const sourceFiles: string[] = [];
    const groups = [
      dataStructureGroup("models", [{ kind: "type-reference", value: "MissingModel" }]),
    ];

    expect(() => assertStrictGroupCoverage(sourceFiles, groups)).toThrow(
      "type-reference: MissingModel",
    );
  });
});

function moduleGroup(
  name: string,
  matchedPaths: string[],
  unmatchedMembers: Array<{ kind: "include-pattern"; value: string }> = [],
): GroupSummary {
  return {
    id: `${name}-group`,
    name,
    type: "module",
    position: { x: 100, y: 100 },
    width: 212,
    height: 46,
    matchedMembers: matchedPaths.map((filePath) => ({
      kind: "source-file",
      path: filePath,
      matchedBy: ["fixture"],
    })),
    unmatchedMembers,
  };
}

function dataStructureGroup(
  name: string,
  unmatchedMembers: Array<{ kind: "type-reference"; value: string }>,
): GroupSummary {
  return {
    id: `${name}-group`,
    name,
    type: "data-structure",
    position: { x: 320, y: 100 },
    width: 212,
    height: 46,
    matchedMembers: [],
    unmatchedMembers,
  };
}
