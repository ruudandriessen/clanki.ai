import { describe, expect, test } from "bun:test";

import type { ArchitectureDiff } from "./architecture-diff";
import { layoutArchitectureDiffGraph } from "./layout-architecture-diff-graph";

describe("layoutArchitectureDiffGraph", () => {
  test("places files from different directories into separate columns", () => {
    const diff: ArchitectureDiff = {
      addedEdgeCount: 1,
      addedFileCount: 1,
      removedEdgeCount: 0,
      removedFileCount: 0,
      files: [
        { file: "src/a.ts", status: "modified" },
        { file: "src/lib/b.ts", status: "added" },
      ],
      edges: [{ fromFile: "src/a.ts", toFile: "src/lib/b.ts", status: "added" }],
    };

    const layout = layoutArchitectureDiffGraph(diff);

    expect(layout.columns.map((column) => column.directory)).toEqual(["src", "src/lib"]);
    expect(layout.nodes).toHaveLength(2);
    expect(layout.edges).toHaveLength(1);
    expect(layout.nodes[0].x).toBeLessThan(layout.nodes[1].x);
  });
});
