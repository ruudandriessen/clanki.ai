/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import type { UIMessage } from "@tanstack/ai-react";
import { buildChatTimeline } from "./chat-timeline";

describe("buildChatTimeline", () => {
  test("groups tool activity in front of the assistant reply", () => {
    const messages: UIMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", content: "Add a login form" }],
        createdAt: new Date(1),
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [
          { type: "thinking", content: "Planning the change" },
          {
            type: "tool-call",
            id: "call-1",
            name: "bash",
            arguments: "{}",
            state: "complete",
            input: { command: "ls" },
            output: "src",
          },
          { type: "text", content: "Done." },
        ],
        createdAt: new Date(2),
      },
    ];

    const timeline = buildChatTimeline({ messages, isLoading: false });

    expect(timeline.map((entry) => entry.type)).toEqual(["message", "activity-group", "message"]);
    expect(timeline[0]).toMatchObject({
      type: "message",
      role: "user",
      content: "Add a login form",
    });
    expect(timeline[2]).toMatchObject({ type: "message", role: "assistant", content: "Done." });
  });
});
