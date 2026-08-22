/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { shouldResumeTaskChat } from "./task-chat-resume";

describe("shouldResumeTaskChat", () => {
  test("returns true for joinRun requests", () => {
    const request = new Request("https://app.local/api/tasks/task-1/chat?runId=run-1&offset=-1");
    expect(shouldResumeTaskChat(request)).toBe(true);
  });

  test("returns true when Last-Event-ID is present", () => {
    const request = new Request("https://app.local/api/tasks/task-1/chat", {
      headers: { "Last-Event-ID": "sqlite:v1:run-1:3", "X-Run-Id": "run-1" },
    });
    expect(shouldResumeTaskChat(request)).toBe(true);
  });

  test("returns false for reconstruct requests", () => {
    const request = new Request("https://app.local/api/tasks/task-1/chat?threadId=task-1");
    expect(shouldResumeTaskChat(request)).toBe(false);
  });
});
