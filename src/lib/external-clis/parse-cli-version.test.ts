/// <reference types="bun-types" />
import { describe, expect, test } from "bun:test";
import { parseCliVersion } from "./parse-cli-version";

describe("parseCliVersion", () => {
  test("parses gh version output", () => {
    expect(
      parseCliVersion(
        "gh version 2.91.0 (2026-04-22)\nhttps://github.com/cli/cli/releases/tag/v2.91.0",
      ),
    ).toBe("2.91.0");
  });

  test("parses a simple semver line", () => {
    expect(parseCliVersion("opencode 1.2.3")).toBe("1.2.3");
  });

  test("returns null for empty output", () => {
    expect(parseCliVersion("")).toBeNull();
    expect(parseCliVersion("   \n  ")).toBeNull();
  });
});
