import { describe, expect, test } from "bun:test";

import { resolveGroups } from "./groups";
import type { ModelSummary } from "./functions/run/models/report";
import type { ClankiConfig } from "./model/config";

type ModuleGlobFixture = {
  name: string;
  include: string[];
  sourceFiles: string[];
  expectedMatched: string[];
  expectedUnmatched: string[];
};

describe("resolveGroups module include matching", () => {
  const fixtures: ModuleGlobFixture[] = [
    {
      name: "matches a single path segment with *",
      include: ["src/*.ts"],
      sourceFiles: ["src/a.ts", "src/nested/b.ts", "src/a.tsx"],
      expectedMatched: ["src/a.ts"],
      expectedUnmatched: [],
    },
    {
      name: "matches zero or more nested segments with **",
      include: ["src/**/*.ts"],
      sourceFiles: ["src/a.ts", "src/nested/b.ts", "src/nested/deep/c.ts", "other/d.ts"],
      expectedMatched: ["src/a.ts", "src/nested/b.ts", "src/nested/deep/c.ts"],
      expectedUnmatched: [],
    },
    {
      name: "matches a single character with ?",
      include: ["src/file?.ts"],
      sourceFiles: ["src/file1.ts", "src/fileA.ts", "src/file10.ts"],
      expectedMatched: ["src/file1.ts", "src/fileA.ts"],
      expectedUnmatched: [],
    },
    {
      name: "matches dotfiles, treats !/# literally, and tracks unmatched patterns",
      include: ["src/*.ts", "!literal.ts", "#literal.ts", "missing/*.ts"],
      sourceFiles: ["src/.hidden.ts", "src/file.ts", "!literal.ts", "#literal.ts"],
      expectedMatched: ["!literal.ts", "#literal.ts", "src/.hidden.ts", "src/file.ts"],
      expectedUnmatched: ["missing/*.ts"],
    },
  ];

  for (const fixture of fixtures) {
    test(fixture.name, () => {
      const group = resolveModuleGroupSummary(fixture.include, fixture.sourceFiles);

      expect(group.position).toEqual({ x: 120, y: 160 });
      expect(group.matchedMembers.map((member) => member.path)).toEqual(fixture.expectedMatched);
      expect(group.unmatchedMembers.map((member) => member.value)).toEqual(
        fixture.expectedUnmatched,
      );
    });
  }
});

function resolveModuleGroupSummary(include: string[], sourceFiles: string[]) {
  const config: ClankiConfig = {
    version: 1,
    strict: false,
    groups: [
      {
        id: "fixture-module",
        name: "Fixture Module",
        type: "module",
        position: { x: 120, y: 160 },
        width: 212,
        height: 46,
        include,
      },
    ],
  };

  const [groupSummary] = resolveGroups(config, "/repo/clanki.json", "/repo", sourceFiles, []);

  if (!groupSummary || groupSummary.type !== "module") {
    throw new Error("Expected a module group summary");
  }

  return groupSummary;
}

describe("resolveGroups data-structure names", () => {
  test("propagates group name and configured model names from config", () => {
    const config: ClankiConfig = {
      version: 1,
      strict: false,
      groups: [
        {
          id: "domain-models",
          name: "Domain Models",
          type: "data-structure",
          position: { x: 380, y: 160 },
          width: 212,
          height: 46,
          types: [
            { id: "User", name: "User Profile" },
            { id: "Order", file: "src/models/order.ts", name: "Order Record" },
            { id: "MissingType", name: "Missing Type" },
          ],
        },
      ],
    };

    const models: ModelSummary[] = [
      buildModelSummary("model-user", "User", "src/models/user.ts"),
      buildModelSummary("model-order", "Order", "src/models/order.ts"),
    ];

    const [groupSummary] = resolveGroups(config, "/repo/clanki.json", "/repo", [], models);

    if (!groupSummary || groupSummary.type !== "data-structure") {
      throw new Error("Expected a data-structure group summary");
    }

    expect(groupSummary.id).toBe("domain-models");
    expect(groupSummary.name).toBe("Domain Models");
    expect(groupSummary.position).toEqual({ x: 380, y: 160 });
    expect(groupSummary.unmatchedMembers.map((member) => member.value)).toEqual(["MissingType"]);

    const userMember = groupSummary.matchedMembers.find((member) => member.id === "model-user");
    const orderMember = groupSummary.matchedMembers.find((member) => member.id === "model-order");

    expect(userMember?.name).toBe("User Profile");
    expect(orderMember?.name).toBe("Order Record");
  });
});

function buildModelSummary(id: string, name: string, file: string): ModelSummary {
  return {
    kind: "interface",
    id,
    isDefaultExport: false,
    isExported: true,
    jsDocSummary: null,
    location: { file, line: 1, column: 1 },
    members: [],
    name,
    referencedTypeNames: [],
    sourceText: `export interface ${name} {}`,
  };
}
