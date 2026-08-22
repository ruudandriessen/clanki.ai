/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { createTaskSandbox } from "./task-harness";

describe("createTaskSandbox", () => {
  test("declares a local workspace so withSandbox can provide sandbox-projection", () => {
    const sandbox = createTaskSandbox({
      taskId: "task-1",
      workspacePath: "/tmp/clanki-worktree",
    });

    expect(sandbox.workspace).toEqual({
      source: { type: "local", path: "/tmp/clanki-worktree" },
      root: "/workspace",
    });
  });
});
