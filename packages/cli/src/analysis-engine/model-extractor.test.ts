import { describe, expect, test } from "bun:test";

import { collectModels } from "./model-extractor";
import { loadTypeScriptProgram } from "./program-loader";
import { createSimpleTestProject } from "./test-project";

describe("collectModels", () => {
  test("extracts exported model declarations and metadata", () => {
    const { tsconfigPath, cleanup } = createSimpleTestProject();

    try {
      const { program, projectDirectory } = loadTypeScriptProgram(tsconfigPath);
      const models = collectModels(program, projectDirectory);

      expect(models.map((model) => model.name)).toEqual([
        "Account",
        "DefaultModel",
        "User",
        "Order",
        "UserOrOrder",
        "Status",
      ]);
      expect(models.some((model) => model.name === "_InternalOnly")).toBe(false);

      const userModel = models.find((model) => model.name === "User");
      expect(userModel?.jsDocSummary).toBe("A user model.");

      const accountModel = models.find((model) => model.name === "Account");
      expect(accountModel?.referencedTypeNames).toEqual(["Order", "User"]);

      const defaultModel = models.find((model) => model.name === "DefaultModel");
      expect(defaultModel?.isDefaultExport).toBe(true);
    } finally {
      cleanup();
    }
  });
});
