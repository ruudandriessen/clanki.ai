import path from "node:path";

import { describe, expect, test } from "bun:test";

import { loadTypeScriptProgram } from "./program-loader";
import { createSimpleTestProject } from "./test-project";

describe("loadTypeScriptProgram", () => {
  test("loads tsconfig and creates a program for the fixture project", () => {
    const { tsconfigPath, cleanup } = createSimpleTestProject();

    try {
      const { resolvedTsconfigPath, projectDirectory, parsedConfig, program } =
        loadTypeScriptProgram(tsconfigPath);

      expect(resolvedTsconfigPath).toBe(tsconfigPath);
      expect(projectDirectory).toBe(path.dirname(tsconfigPath));
      expect(parsedConfig.errors).toHaveLength(0);

      const sourceFiles = program
        .getSourceFiles()
        .filter((sourceFile) => sourceFile.fileName.startsWith(projectDirectory));

      expect(sourceFiles.length).toBeGreaterThanOrEqual(4);
    } finally {
      cleanup();
    }
  });
});
