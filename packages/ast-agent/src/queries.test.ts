import { describe, expect, test } from "bun:test";

import { getSource, incomingDeps, listSourceFiles, outgoingDeps, searchSymbols } from "./queries";
import { createAstAgentTestProject } from "./test-project";
import { createTypeScriptIndex } from "./typescript-index";

describe("TypeScript AST queries", () => {
  test("lists project source files and searches symbols without reading whole files", () => {
    const { tsconfigPath, cleanup } = createAstAgentTestProject();
    const index = createTypeScriptIndex(tsconfigPath);

    try {
      expect(listSourceFiles(index)).toEqual(["src/accounts.ts", "src/app.ts", "src/models.ts"]);

      const matches = searchSymbols(index, "createUser");
      expect(
        matches.some((symbol) => symbol.file === "src/models.ts" && symbol.name === "createUser"),
      ).toBe(true);
    } finally {
      index.dispose();
      cleanup();
    }
  });

  test("returns outgoing and incoming symbol dependencies for a function", () => {
    const { tsconfigPath, cleanup } = createAstAgentTestProject();
    const index = createTypeScriptIndex(tsconfigPath);

    try {
      const outgoing = outgoingDeps(index, { file: "src/accounts.ts", name: "createAccount" });
      expect(outgoing.map((symbol) => `${symbol.file}:${symbol.name}`)).toEqual(
        expect.arrayContaining(["src/models.ts:createUser", "src/models.ts:User"]),
      );

      const incoming = incomingDeps(index, { file: "src/models.ts", name: "createUser" });
      expect(incoming.map((symbol) => `${symbol.file}:${symbol.name}`)).toEqual(
        expect.arrayContaining(["src/accounts.ts:createAccount"]),
      );
    } finally {
      index.dispose();
      cleanup();
    }
  });

  test("returns only the declaration source for a symbol", () => {
    const { tsconfigPath, cleanup } = createAstAgentTestProject();
    const index = createTypeScriptIndex(tsconfigPath);

    try {
      const source = getSource(index, { file: "src/models.ts", name: "createUser" });

      expect(source.symbol.name).toBe("createUser");
      expect(source.text).toContain("export function createUser");
      expect(source.text).not.toContain("export interface User");
      expect(source.text).not.toContain("createAccount");
    } finally {
      index.dispose();
      cleanup();
    }
  });
});
