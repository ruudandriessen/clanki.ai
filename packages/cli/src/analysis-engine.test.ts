import { describe, expect, test } from "bun:test";

import { analyzeProject } from "./analysis-engine";
import { createSimpleTestProject } from "./analysis-engine/test-project";

describe("analyzeProject", () => {
  test("returns project-local files and import edges", () => {
    const { tsconfigPath, cleanup } = createSimpleTestProject();

    try {
      const graph = analyzeProject(tsconfigPath);

      expect(graph.tsconfigPath).toBe(tsconfigPath);
      expect(graph.files).toEqual([
        "src/consumer.ts",
        "src/models.ts",
        "src/orphan.ts",
        "src/reexports.ts",
      ]);
      expect(graph.edges).toEqual([
        {
          fromFile: "src/consumer.ts",
          toFile: "src/models.ts",
        },
        {
          fromFile: "src/reexports.ts",
          toFile: "src/models.ts",
        },
      ]);
    } finally {
      cleanup();
    }
  });
});
