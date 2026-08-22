import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export function createSimpleTestProject(): {
  tsconfigPath: string;
  cleanup: () => void;
} {
  const projectDirectory = mkdtempSync(path.join(os.tmpdir(), "clanki-analysis-engine-"));
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
    `/** A user model. */
export interface User {
  id: string;
}

export class Order {
  public amount: number;

  constructor(amount: number) {
    this.amount = amount;
  }
}

export type UserOrOrder = User | Order;

export enum Status {
  Open = "open",
}

interface _InternalOnly {
  hidden: string;
}
`,
  );

  writeFileSync(
    path.join(srcDirectory, "consumer.ts"),
    `import type { Order, User } from "./models";

export interface Account {
  owner: User;
  latestOrder: Order;
}
`,
  );

  writeFileSync(
    path.join(srcDirectory, "reexports.ts"),
    `export { type User as Person } from "./models";
`,
  );

  writeFileSync(
    path.join(srcDirectory, "default-export.ts"),
    `export default interface DefaultModel {
  value: string;
}
`,
  );

  return {
    tsconfigPath: path.join(projectDirectory, "tsconfig.json"),
    cleanup: () => {
      rmSync(projectDirectory, { recursive: true, force: true });
    },
  };
}
