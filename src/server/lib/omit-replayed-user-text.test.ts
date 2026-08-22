/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { lastUserMessageText } from "./omit-replayed-user-text";

describe("lastUserMessageText", () => {
  test("returns the trailing user turn", () => {
    expect(
      lastUserMessageText([
        { role: "user", content: "First" },
        { role: "assistant", content: "Okay" },
        { role: "user", content: [{ type: "text", content: "Second" }] },
      ]),
    ).toBe("Second");
  });
});
