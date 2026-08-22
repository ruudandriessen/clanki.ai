export const FIRST_TASK_INSTRUCTION =
  "Before doing any work, create and switch to a dedicated git branch for this task if you are not already on one. If the workspace is already on a dedicated task branch, keep using it. Do all work for this task on that branch.";

export function firstTaskSystemPrompts(isFirstTurn: boolean): string[] {
  return isFirstTurn ? [FIRST_TASK_INSTRUCTION] : [];
}
