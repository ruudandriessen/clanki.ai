import { describe, expect, test } from "bun:test";
import { ZodError } from "zod";

import { validateConfig } from "./loadConfig.ts";

describe("validateConfig id and name support", () => {
  test("accepts id + name on groups and data-model references", () => {
    const config = validateConfig({
      version: 1,
      groups: [
        {
          id: "core-module",
          name: "Core Module",
          type: "module",
          position: { x: 120, y: 220 },
          width: 212,
          height: 46,
          include: ["src/**/*.ts"],
        },
        {
          id: "core-models",
          name: "Core Models",
          type: "data-structure",
          position: { x: 340, y: 220 },
          width: 212,
          height: 46,
          types: [
            { id: "User", name: "User" },
            { id: "Order", name: "Order Aggregate" },
            { id: "ApiResponse", file: "src/shared/api.ts", name: "API Response" },
          ],
        },
      ],
    });

    const [moduleGroup, modelGroup] = config.groups;
    expect(moduleGroup?.id).toBe("core-module");
    expect(moduleGroup?.name).toBe("Core Module");
    expect(modelGroup?.id).toBe("core-models");
    expect(modelGroup?.name).toBe("Core Models");

    if (!modelGroup || modelGroup.type !== "data-structure") {
      throw new Error("Expected a data-structure group");
    }

    const orderRef = modelGroup.types[1];
    const responseRef = modelGroup.types[2];

    if (typeof orderRef === "string" || typeof responseRef === "string") {
      throw new Error("Expected object type references");
    }

    expect(orderRef).toEqual({ id: "Order", name: "Order Aggregate" });
    expect(responseRef).toEqual({
      id: "ApiResponse",
      file: "src/shared/api.ts",
      name: "API Response",
    });
  });

  test("accepts empty members for newly drawn groups", () => {
    const config = validateConfig({
      version: 1,
      groups: [
        {
          id: "new-module",
          name: "New module",
          type: "module",
          position: { x: 120, y: 220 },
          width: 212,
          height: 46,
          include: [],
        },
        {
          id: "new-data-structure",
          name: "New data structure",
          type: "data-structure",
          position: { x: 340, y: 220 },
          width: 212,
          height: 46,
          types: [],
        },
      ],
    });

    expect(config.groups).toHaveLength(2);
  });

  test("rejects missing id and empty name values", () => {
    expectZodPath(
      () =>
        validateConfig({
          version: 1,
          groups: [
            {
              name: "Core Module",
              type: "module",
              width: 212,
              height: 46,
              position: { x: 120, y: 220 },
              include: ["src/**/*.ts"],
            },
          ],
        }),
      ["groups", 0, "id"],
    );

    expectZodPath(
      () =>
        validateConfig({
          version: 1,
          groups: [
            {
              id: "core-models",
              name: "",
              type: "data-structure",
              width: 212,
              height: 46,
              position: { x: 340, y: 220 },
              types: ["User"],
            },
          ],
        }),
      ["groups", 0, "name"],
    );

    expectZodPath(
      () =>
        validateConfig({
          version: 1,
          groups: [
            {
              id: "core-models",
              name: "Core Models",
              type: "data-structure",
              position: { x: 340, y: 220 },
              width: 212,
              height: 46,
              types: [{ id: "User", name: "" }],
            },
          ],
        }),
      ["groups", 0, "types", 0, "name"],
    );

    expectZodPath(
      () =>
        validateConfig({
          version: 1,
          groups: [
            {
              id: "core-models",
              name: "Core Models",
              type: "data-structure",
              position: { x: 340, y: 220 },
              width: 212,
              height: 46,
              types: ["User"],
            },
          ],
        }),
      ["groups", 0, "types", 0],
    );

    expectZodPath(
      () =>
        validateConfig({
          version: 1,
          groups: [
            {
              id: "core-module",
              name: "Core Module",
              type: "module",
              width: 212,
              height: 46,
              include: ["src/**/*.ts"],
            },
          ],
        }),
      ["groups", 0, "position"],
    );

    expectZodPath(
      () =>
        validateConfig({
          version: 1,
          groups: [
            {
              id: "core-module",
              name: "Core Module",
              type: "module",
              position: { x: Number.NaN, y: 220 },
              width: 212,
              height: 46,
              include: ["src/**/*.ts"],
            },
          ],
        }),
      ["groups", 0, "position", "x"],
    );
  });

  test("accepts valid diagram edges and rejects invalid edges", () => {
    const config = validateConfig({
      version: 1,
      groups: [
        {
          id: "core-module",
          name: "Core Module",
          type: "module",
          width: 212,
          height: 46,
          position: { x: 120, y: 220 },
          include: ["src/**/*.ts"],
        },
        {
          id: "ui-module",
          name: "UI Module",
          type: "module",
          width: 212,
          height: 46,
          position: { x: 340, y: 220 },
          include: ["src/ui/**/*.ts"],
        },
      ],
      edges: [{ from: "core-module", to: "ui-module" }],
    });

    expect(config.edges).toEqual([{ from: "core-module", to: "ui-module" }]);

    expectZodPath(
      () =>
        validateConfig({
          version: 1,
          groups: [
            {
              id: "core-module",
              name: "Core Module",
              type: "module",
              width: 212,
              height: 46,
              position: { x: 120, y: 220 },
              include: ["src/**/*.ts"],
            },
          ],
          edges: [{ from: "missing", to: "core-module" }],
        }),
      ["edges", 0, "from"],
    );

    expectZodPath(
      () =>
        validateConfig({
          version: 1,
          groups: [
            {
              id: "core-module",
              name: "Core Module",
              type: "module",
              width: 212,
              height: 46,
              position: { x: 120, y: 220 },
              include: ["src/**/*.ts"],
            },
          ],
          edges: [{ from: "core-module", to: "core-module" }],
        }),
      ["edges", 0],
    );

    expectZodPath(
      () =>
        validateConfig({
          version: 1,
          groups: [
            {
              id: "core-module",
              name: "Core Module",
              type: "module",
              width: 212,
              height: 46,
              position: { x: 120, y: 220 },
              include: ["src/**/*.ts"],
            },
            {
              id: "ui-module",
              name: "UI Module",
              type: "module",
              width: 212,
              height: 46,
              position: { x: 340, y: 220 },
              include: ["src/ui/**/*.ts"],
            },
          ],
          edges: [
            { from: "core-module", to: "ui-module" },
            { from: "core-module", to: "ui-module" },
          ],
        }),
      ["edges", 1],
    );
  });
});

function expectZodPath(fn: () => void, expectedPath: Array<string | number>): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ZodError);
    if (!(error instanceof ZodError)) {
      throw new Error("Expected ZodError", { cause: error });
    }

    expect(error.issues[0]?.path).toEqual(expectedPath);
    return;
  }

  throw new Error("Expected validation to throw");
}
