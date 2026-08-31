import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "bun:test";

import { parseAstAgentArgs, resolveTsconfigPath } from "./args";

describe("parseAstAgentArgs", () => {
  test("reads --project and the remaining prompt", () => {
    expect(parseAstAgentArgs(["--project", "tsconfig.json", "Who depends on createUser?"])).toEqual(
      {
        help: false,
        project: "tsconfig.json",
        prompt: "Who depends on createUser?",
      },
    );
  });
});

describe("resolveTsconfigPath", () => {
  test("resolves a directory to tsconfig.json", () => {
    const projectDirectory = mkdtempSync(path.join(os.tmpdir(), "clanki-ast-agent-cli-"));

    try {
      const tsconfigPath = path.join(projectDirectory, "tsconfig.json");
      writeFileSync(tsconfigPath, "{}\n");
      expect(resolveTsconfigPath(projectDirectory)).toBe(tsconfigPath);
    } finally {
      rmSync(projectDirectory, { recursive: true, force: true });
    }
  });
});
