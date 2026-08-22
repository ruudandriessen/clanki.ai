import { describe, expect, test } from "bun:test";

import type { DependencyGraph } from "./analysis-engine/types";
import {
  countDependencyGraphChanges,
  diffDependencyGraphs,
  selectChangedDependencyGraph,
} from "./diff-graphs";

describe("diffDependencyGraphs", () => {
  test("marks added and removed files and import edges", () => {
    const before = createGraph(
      ["src/a.ts", "src/b.ts", "src/c.ts"],
      [
        { fromFile: "src/a.ts", toFile: "src/b.ts" },
        { fromFile: "src/a.ts", toFile: "src/c.ts" },
      ],
    );
    const after = createGraph(
      ["src/a.ts", "src/b.ts", "src/d.ts"],
      [
        { fromFile: "src/a.ts", toFile: "src/b.ts" },
        { fromFile: "src/a.ts", toFile: "src/d.ts" },
      ],
    );

    expect(diffDependencyGraphs(before, after)).toEqual({
      files: [
        { file: "src/a.ts", status: "modified" },
        { file: "src/b.ts", status: "unchanged" },
        { file: "src/c.ts", status: "removed" },
        { file: "src/d.ts", status: "added" },
      ],
      edges: [
        { fromFile: "src/a.ts", toFile: "src/b.ts", status: "unchanged" },
        { fromFile: "src/a.ts", toFile: "src/c.ts", status: "removed" },
        { fromFile: "src/a.ts", toFile: "src/d.ts", status: "added" },
      ],
    });
  });

  test("marks existing files as modified when only an import edge changes", () => {
    const before = createGraph(["src/a.ts", "src/b.ts"], []);
    const after = createGraph(
      ["src/a.ts", "src/b.ts"],
      [{ fromFile: "src/a.ts", toFile: "src/b.ts" }],
    );

    expect(diffDependencyGraphs(before, after).files).toEqual([
      { file: "src/a.ts", status: "modified" },
      { file: "src/b.ts", status: "modified" },
    ]);
  });
});

describe("selectChangedDependencyGraph", () => {
  test("keeps changed files and remaining edges between them", () => {
    const diff = diffDependencyGraphs(
      createGraph(
        ["src/a.ts", "src/b.ts", "src/c.ts"],
        [
          { fromFile: "src/a.ts", toFile: "src/b.ts" },
          { fromFile: "src/b.ts", toFile: "src/c.ts" },
        ],
      ),
      createGraph(
        ["src/a.ts", "src/b.ts", "src/d.ts"],
        [
          { fromFile: "src/a.ts", toFile: "src/b.ts" },
          { fromFile: "src/a.ts", toFile: "src/d.ts" },
        ],
      ),
    );

    expect(selectChangedDependencyGraph(diff)).toEqual({
      files: [
        { file: "src/a.ts", status: "modified" },
        { file: "src/b.ts", status: "modified" },
        { file: "src/c.ts", status: "removed" },
        { file: "src/d.ts", status: "added" },
      ],
      edges: [
        { fromFile: "src/a.ts", toFile: "src/b.ts", status: "unchanged" },
        { fromFile: "src/a.ts", toFile: "src/d.ts", status: "added" },
        { fromFile: "src/b.ts", toFile: "src/c.ts", status: "removed" },
      ],
    });
  });
});

describe("countDependencyGraphChanges", () => {
  test("counts added and removed files and edges from the full diff", () => {
    const diff = diffDependencyGraphs(
      createGraph(["src/a.ts", "src/b.ts"], [{ fromFile: "src/a.ts", toFile: "src/b.ts" }]),
      createGraph(["src/a.ts", "src/c.ts"], [{ fromFile: "src/a.ts", toFile: "src/c.ts" }]),
    );

    expect(countDependencyGraphChanges(diff)).toEqual({
      addedEdgeCount: 1,
      addedFileCount: 1,
      removedEdgeCount: 1,
      removedFileCount: 1,
    });
  });
});

function createGraph(files: string[], edges: DependencyGraph["edges"]): DependencyGraph {
  return {
    tsconfigPath: "/tmp/tsconfig.json",
    projectDirectory: "/tmp",
    files,
    edges,
  };
}
