import { describe, expect, test } from "bun:test";

import { collectSourceFileDependencies } from "./dependency-extractor";
import { loadTypeScriptProgram } from "./program-loader";
import { createSimpleTestProject } from "./test-project";

describe("collectSourceFileDependencies", () => {
  test("collects project-local import and re-export dependencies", () => {
    const { tsconfigPath, cleanup } = createSimpleTestProject();

    try {
      const { program, projectDirectory, parsedConfig } = loadTypeScriptProgram(tsconfigPath);

      const dependencies = collectSourceFileDependencies(
        program,
        projectDirectory,
        parsedConfig.options,
      );

      expect(dependencies).toEqual([
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
