/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { FIRST_TASK_INSTRUCTION, firstTaskSystemPrompts } from "./first-task-prompt";

describe("firstTaskSystemPrompts", () => {
  test("returns the branch instruction on the first turn only", () => {
    expect(firstTaskSystemPrompts(true)).toEqual([FIRST_TASK_INSTRUCTION]);
    expect(firstTaskSystemPrompts(false)).toEqual([]);
  });
});
