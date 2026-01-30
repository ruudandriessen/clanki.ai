import { describe, test, expect } from "bun:test";
import { buildGroupGraph } from "../src/group-graph.ts";
import type {
  FileEdge,
  ClassificationResult,
  GroupEdge,
} from "../src/types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classify(
  map: Record<string, string>,
  unclassified: string[] = [],
): ClassificationResult {
  return {
    classifications: Object.entries(map).map(([file, group]) => ({
      file,
      group,
      strategy: "heuristic" as const,
    })),
    unclassified,
  };
}

function edge(from: string, to: string, symbols: string[]): FileEdge {
  return { from, to, symbols };
}

function findEdge(
  edges: GroupEdge[],
  from: string,
  to: string,
): GroupEdge | undefined {
  return edges.find((e) => e.from === from && e.to === to);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildGroupGraph", () => {
  test("collapses file edges into group edges", () => {
    const fileEdges: FileEdge[] = [
      edge("/src/components/Button.tsx", "/src/services/auth.ts", ["login"]),
      edge("/src/routes/users.ts", "/src/services/auth.ts", ["login", "logout"]),
    ];

    const classification = classify({
      "/src/components/Button.tsx": "UI Components",
      "/src/services/auth.ts": "Business Logic",
      "/src/routes/users.ts": "API Routes",
    });

    const result = buildGroupGraph(fileEdges, classification);

    expect(result).toHaveLength(2);

    const uiToBl = findEdge(result, "UI Components", "Business Logic");
    expect(uiToBl).toBeDefined();
    expect(uiToBl!.weight).toBe(1);
    expect(uiToBl!.symbols).toEqual(["login"]);

    const apiToBl = findEdge(result, "API Routes", "Business Logic");
    expect(apiToBl).toBeDefined();
    expect(apiToBl!.weight).toBe(1);
    expect(apiToBl!.symbols).toEqual(["login", "logout"]);
  });

  test("drops intra-group edges", () => {
    const fileEdges: FileEdge[] = [
      edge("/src/services/auth.ts", "/src/services/crypto.ts", ["hash"]),
      edge("/src/services/auth.ts", "/src/models/User.ts", ["User"]),
    ];

    const classification = classify({
      "/src/services/auth.ts": "Business Logic",
      "/src/services/crypto.ts": "Business Logic",
      "/src/models/User.ts": "Data Models",
    });

    const result = buildGroupGraph(fileEdges, classification);

    // Only the cross-group edge should remain
    expect(result).toHaveLength(1);
    expect(result[0].from).toBe("Business Logic");
    expect(result[0].to).toBe("Data Models");
    expect(result[0].symbols).toEqual(["User"]);
  });

  test("aggregates weight across multiple file edges between same groups", () => {
    const fileEdges: FileEdge[] = [
      edge("/src/routes/users.ts", "/src/services/auth.ts", ["login"]),
      edge("/src/routes/health.ts", "/src/services/status.ts", ["getStatus"]),
      edge("/src/routes/orders.ts", "/src/services/orders.ts", ["createOrder"]),
    ];

    const classification = classify({
      "/src/routes/users.ts": "API Routes",
      "/src/routes/health.ts": "API Routes",
      "/src/routes/orders.ts": "API Routes",
      "/src/services/auth.ts": "Business Logic",
      "/src/services/status.ts": "Business Logic",
      "/src/services/orders.ts": "Business Logic",
    });

    const result = buildGroupGraph(fileEdges, classification);

    expect(result).toHaveLength(1);
    expect(result[0].from).toBe("API Routes");
    expect(result[0].to).toBe("Business Logic");
    expect(result[0].weight).toBe(3);
    expect(result[0].symbols).toEqual(["createOrder", "getStatus", "login"]);
  });

  test("deduplicates symbols across file edges", () => {
    const fileEdges: FileEdge[] = [
      edge("/src/routes/users.ts", "/src/models/User.ts", ["User"]),
      edge("/src/routes/admin.ts", "/src/models/User.ts", ["User", "UserRole"]),
    ];

    const classification = classify({
      "/src/routes/users.ts": "API Routes",
      "/src/routes/admin.ts": "API Routes",
      "/src/models/User.ts": "Data Models",
    });

    const result = buildGroupGraph(fileEdges, classification);

    expect(result).toHaveLength(1);
    expect(result[0].weight).toBe(2);
    // "User" appears in both edges but should be deduplicated
    expect(result[0].symbols).toEqual(["User", "UserRole"]);
  });

  test("skips edges where either file is unclassified", () => {
    const fileEdges: FileEdge[] = [
      edge("/src/routes/users.ts", "/src/services/auth.ts", ["login"]),
      edge("/src/unknown/foo.ts", "/src/services/auth.ts", ["bar"]),
      edge("/src/routes/users.ts", "/src/unknown/baz.ts", ["baz"]),
    ];

    const classification = classify(
      {
        "/src/routes/users.ts": "API Routes",
        "/src/services/auth.ts": "Business Logic",
      },
      ["/src/unknown/foo.ts", "/src/unknown/baz.ts"],
    );

    const result = buildGroupGraph(fileEdges, classification);

    // Only the edge between two classified files should remain
    expect(result).toHaveLength(1);
    expect(result[0].from).toBe("API Routes");
    expect(result[0].to).toBe("Business Logic");
  });

  test("returns empty array when no cross-group edges exist", () => {
    const fileEdges: FileEdge[] = [
      edge("/src/services/auth.ts", "/src/services/crypto.ts", ["hash"]),
    ];

    const classification = classify({
      "/src/services/auth.ts": "Business Logic",
      "/src/services/crypto.ts": "Business Logic",
    });

    const result = buildGroupGraph(fileEdges, classification);
    expect(result).toHaveLength(0);
  });

  test("returns empty array for empty inputs", () => {
    const result = buildGroupGraph([], classify({}));
    expect(result).toHaveLength(0);
  });

  test("handles bidirectional edges between groups", () => {
    const fileEdges: FileEdge[] = [
      edge("/src/routes/users.ts", "/src/services/auth.ts", ["login"]),
      edge("/src/services/auth.ts", "/src/routes/users.ts", ["UserRequest"]),
    ];

    const classification = classify({
      "/src/routes/users.ts": "API Routes",
      "/src/services/auth.ts": "Business Logic",
    });

    const result = buildGroupGraph(fileEdges, classification);

    expect(result).toHaveLength(2);

    const apiToBl = findEdge(result, "API Routes", "Business Logic");
    expect(apiToBl).toBeDefined();
    expect(apiToBl!.weight).toBe(1);
    expect(apiToBl!.symbols).toEqual(["login"]);

    const blToApi = findEdge(result, "Business Logic", "API Routes");
    expect(blToApi).toBeDefined();
    expect(blToApi!.weight).toBe(1);
    expect(blToApi!.symbols).toEqual(["UserRequest"]);
  });

  test("output is sorted by from group then to group", () => {
    const fileEdges: FileEdge[] = [
      edge("/src/services/auth.ts", "/src/models/User.ts", ["User"]),
      edge("/src/components/App.tsx", "/src/services/auth.ts", ["login"]),
      edge("/src/routes/users.ts", "/src/models/User.ts", ["User"]),
      edge("/src/components/App.tsx", "/src/models/User.ts", ["User"]),
    ];

    const classification = classify({
      "/src/components/App.tsx": "UI Components",
      "/src/services/auth.ts": "Business Logic",
      "/src/models/User.ts": "Data Models",
      "/src/routes/users.ts": "API Routes",
    });

    const result = buildGroupGraph(fileEdges, classification);

    const keys = result.map((e) => `${e.from} -> ${e.to}`);
    expect(keys).toEqual([
      "API Routes -> Data Models",
      "Business Logic -> Data Models",
      "UI Components -> Business Logic",
      "UI Components -> Data Models",
    ]);
  });

  test("handles side-effect imports with empty symbols", () => {
    const fileEdges: FileEdge[] = [
      edge("/src/components/App.tsx", "/src/styles/global.css", []),
    ];

    const classification = classify({
      "/src/components/App.tsx": "UI Components",
      "/src/styles/global.css": "Styles",
    });

    const result = buildGroupGraph(fileEdges, classification);

    expect(result).toHaveLength(1);
    expect(result[0].weight).toBe(1);
    expect(result[0].symbols).toEqual([]);
  });

  test("matches the example from the plan document", () => {
    // Simulate a project with 4 groups and cross-group imports
    const fileEdges: FileEdge[] = [
      // UI Components → Business Logic (multiple files, 12 unique symbols)
      ...Array.from({ length: 5 }, (_, i) =>
        edge(`/ui/comp${i}.tsx`, "/bl/service.ts", [`fn${i}`, `fn${i + 5}`]),
      ),
      edge("/ui/comp5.tsx", "/bl/service.ts", ["fn10", "fn11"]),
      // API Routes → Business Logic (8 symbols)
      ...Array.from({ length: 4 }, (_, i) =>
        edge(`/api/route${i}.ts`, "/bl/service.ts", [`api${i}`, `api${i + 4}`]),
      ),
      // API Routes → Data Models (3 symbols)
      edge("/api/route0.ts", "/dm/User.ts", ["User"]),
      edge("/api/route1.ts", "/dm/Order.ts", ["Order"]),
      edge("/api/route2.ts", "/dm/Product.ts", ["Product"]),
      // Business Logic → Data Models (6 symbols)
      edge("/bl/service.ts", "/dm/User.ts", ["User", "UserRole"]),
      edge("/bl/service.ts", "/dm/Order.ts", ["Order", "OrderStatus"]),
      edge("/bl/service.ts", "/dm/Product.ts", ["Product", "Category"]),
    ];

    const classificationMap: Record<string, string> = {};
    for (let i = 0; i <= 5; i++) classificationMap[`/ui/comp${i}.tsx`] = "UI Components";
    for (let i = 0; i < 4; i++) classificationMap[`/api/route${i}.ts`] = "API Routes";
    classificationMap["/bl/service.ts"] = "Business Logic";
    classificationMap["/dm/User.ts"] = "Data Models";
    classificationMap["/dm/Order.ts"] = "Data Models";
    classificationMap["/dm/Product.ts"] = "Data Models";

    const classification = classify(classificationMap);
    const result = buildGroupGraph(fileEdges, classification);

    const uiToBl = findEdge(result, "UI Components", "Business Logic");
    expect(uiToBl).toBeDefined();
    expect(uiToBl!.symbols).toHaveLength(12);
    expect(uiToBl!.weight).toBe(6);

    const apiToBl = findEdge(result, "API Routes", "Business Logic");
    expect(apiToBl).toBeDefined();
    expect(apiToBl!.symbols).toHaveLength(8);
    expect(apiToBl!.weight).toBe(4);

    const apiToDm = findEdge(result, "API Routes", "Data Models");
    expect(apiToDm).toBeDefined();
    expect(apiToDm!.symbols).toHaveLength(3);
    expect(apiToDm!.weight).toBe(3);

    const blToDm = findEdge(result, "Business Logic", "Data Models");
    expect(blToDm).toBeDefined();
    expect(blToDm!.symbols).toHaveLength(6);
    expect(blToDm!.weight).toBe(3);
  });
});
