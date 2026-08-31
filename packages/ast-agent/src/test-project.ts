import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export function createAstAgentTestProject(): {
  projectDirectory: string;
  tsconfigPath: string;
  cleanup: () => void;
} {
  const projectDirectory = mkdtempSync(path.join(os.tmpdir(), "clanki-ast-agent-"));
  const srcDirectory = path.join(projectDirectory, "src");

  mkdirSync(srcDirectory, { recursive: true });

  writeFileSync(
    path.join(projectDirectory, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          target: "ESNext",
          module: "ESNext",
        },
        include: ["src/**/*.ts"],
      },
      null,
      2,
    ),
  );

  writeFileSync(
    path.join(srcDirectory, "models.ts"),
    `export interface User {
  id: string;
  name: string;
}

export function createUser(id: string, name: string): User {
  return { id, name };
}
`,
  );

  writeFileSync(
    path.join(srcDirectory, "accounts.ts"),
    `import { createUser, type User } from "./models";

export function createAccount(ownerName: string): { owner: User } {
  const owner = createUser("1", ownerName);
  return { owner };
}
`,
  );

  writeFileSync(
    path.join(srcDirectory, "app.ts"),
    `import { createAccount } from "./accounts";

export function boot() {
  return createAccount("Ada");
}
`,
  );

  return {
    projectDirectory,
    tsconfigPath: path.join(projectDirectory, "tsconfig.json"),
    cleanup: () => {
      rmSync(projectDirectory, { recursive: true, force: true });
    },
  };
}
