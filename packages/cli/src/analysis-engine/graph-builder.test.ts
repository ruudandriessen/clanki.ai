import { describe, expect, test } from "bun:test";

import { buildAnalysisGraph } from "./graph-builder";

describe("buildAnalysisGraph", () => {
  test("builds sorted nodes and deduplicated edges across stages", () => {
    const models = [
      {
        id: "src/a.ts:1:1:User",
        kind: "interface",
        name: "User",
        location: {
          file: "src/a.ts",
          line: 1,
          column: 1,
        },
        isDefaultExport: false,
        isExported: true,
        jsDocSummary: null,
        members: [],
        referencedTypeNames: ["domain.Profile"],
        sourceText: "export interface User {}",
      },
      {
        id: "src/b.ts:1:1:Profile",
        kind: "interface",
        name: "Profile",
        location: {
          file: "src/b.ts",
          line: 1,
          column: 1,
        },
        isDefaultExport: false,
        isExported: true,
        jsDocSummary: null,
        members: [],
        referencedTypeNames: [],
        sourceText: "export interface Profile {}",
      },
    ];

    const graph = buildAnalysisGraph(["src/a.ts", "src/b.ts"], models, [
      {
        fromFile: "src/a.ts",
        toFile: "src/b.ts",
      },
      {
        fromFile: "src/a.ts",
        toFile: "src/b.ts",
      },
    ]);

    expect(graph.nodes[0]?.type).toBe("model");
    expect(graph.nodes.map((node) => node.id)).toEqual([
      "src/a.ts:1:1:User",
      "src/b.ts:1:1:Profile",
      "src/a.ts",
      "src/b.ts",
    ]);
    expect(graph.edges).toEqual([
      {
        from: "src/a.ts",
        to: "src/a.ts:1:1:User",
        type: "defines-model",
      },
      {
        from: "src/b.ts",
        to: "src/b.ts:1:1:Profile",
        type: "defines-model",
      },
      {
        from: "src/a.ts",
        to: "src/b.ts",
        type: "imports",
      },
      {
        from: "src/a.ts:1:1:User",
        to: "src/b.ts:1:1:Profile",
        type: "references-type",
      },
    ]);
  });
});
