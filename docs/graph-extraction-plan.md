# Graph Extraction Plan

Extract a high-level architectural view from a codebase by classifying files into user-defined semantic "groups", then building dependency and data-flow graphs over those groups. The result gives developers (and LLMs) a mental model of the codebase and enables conceptual diffs on PRs.

---

## Overview

Three core pieces:

1. **File → Group classification** — LLM-assisted mapping of every source file to a user-defined group.
2. **Group → Group dependency graph** — collapsed from file-level imports.
3. **Group → Group data flow** — what symbols cross group boundaries, in which direction, and a narrative description of the data pipeline.

---

## Phase 1: File-Level Import Graph Extraction

### Goal

Produce an edge list of every import relationship between source files, including which symbols are imported.

### Approach (TypeScript)

Use the TypeScript Compiler API (`ts.createProgram`) or `ts-morph` to:

- Walk every source file in the project.
- Extract all `import` / `export` declarations.
- Resolve import specifiers to absolute file paths (respecting `tsconfig.json` paths, `node_modules`, barrel re-exports).
- Record dynamic `import()` calls.
- Capture the **symbol names** that cross each edge, not just the file relationship.

### Output

```ts
interface FileEdge {
  from: string;       // absolute path of importing file
  to: string;         // absolute path of imported file
  symbols: string[];  // named imports (e.g. ["createUser", "UserSchema"])
}
```

An array of `FileEdge` records, serialised as JSON.

### Generalisation to other languages

The TS Compiler API is the best choice for TypeScript because it resolves types and aliases. For other languages, replace the frontend with a **Tree-sitter** parser plus per-language queries that extract import patterns. The edge format stays the same.

---

## Phase 2: Group Configuration and Heuristic Classification

### Goal

Let users declare semantic groups and automatically classify every source file into exactly one group.

### Group config format

```yaml
groups:
  - name: "UI Components"
    description: "React components that render UI"
  - name: "API Routes"
    description: "HTTP endpoint handlers"
  - name: "Data Models"
    description: "Database schemas and types"
  - name: "Business Logic"
    description: "Core domain services and utilities"
```

### Classification strategy (layered)

1. **Heuristic pre-pass** — Use directory structure, file naming conventions, and framework patterns (`src/components/`, `src/routes/`, `*.model.ts`, presence of default export with JSX, etc.). This handles 70-80% of files with zero LLM cost.
2. **LLM classification** — For files the heuristics can't confidently classify, send the file's exports, imports, and first ~100 lines to the LLM along with the group definitions. Request structured output (group name).
3. **Manual overrides** — Users can pin specific files or glob patterns to groups in the config. These take priority over heuristics and LLM.
4. **Caching** — Map file content hash → group assignment. Only re-classify when a file changes.

### Design decision: single group per file

A file belongs to exactly one group. If a file genuinely spans multiple groups, that is a signal it should be split. Single assignment keeps the group graph clean and diffs unambiguous.

---

## Phase 3: Group-Level Dependency Graph

### Goal

Collapse the file-level import graph into a graph between groups.

### Algorithm

```
for each file-level edge (A → B):
  if group(A) ≠ group(B):
    add or update edge: group(A) → group(B)
    attach: symbols crossing this boundary
    increment: edge weight (number of contributing file-level edges)
```

Intra-group edges are dropped — they are internal implementation detail.

### Output

```ts
interface GroupEdge {
  from: string;        // group name
  to: string;          // group name
  weight: number;      // number of file-level edges
  symbols: string[];   // deduplicated symbols crossing the boundary
}
```

### Example

```
UI Components ──(12 symbols)──▶ Business Logic
API Routes ──(8 symbols)──▶ Business Logic
API Routes ──(3 symbols)──▶ Data Models
Business Logic ──(6 symbols)──▶ Data Models
```

---

## Phase 4: LLM-Assisted Classification (enrichment)

### Goal

Improve classification accuracy for files that heuristics can't handle.

### Approach

For each unclassified or low-confidence file, send a prompt with:

- The file's export list and import list.
- The first ~100 lines of source.
- The full list of group names and descriptions.

Request a single group assignment as structured output. Batch these calls where possible to reduce latency.

### Feedback loop

If the user corrects a classification, store the override and use it to improve future heuristic rules (e.g., "files in `lib/auth/` are always Business Logic").

---

## Phase 5: Cross-Boundary Symbol Tracking

### Goal

Enrich group edges with semantic information about what crosses each boundary.

### Approach

For each cross-group import, classify the imported symbol using the TypeScript Compiler API (`ts.SymbolFlags`):

| Category | Examples |
|---|---|
| Type / Interface | `User`, `OrderStatus` |
| Function | `createUser`, `validateEmail` |
| Class | `DatabaseClient`, `Logger` |
| Constant / Config | `API_BASE_URL`, `DEFAULT_TIMEOUT` |
| React Component | `Button`, `UserProfile` |

### Call direction analysis

For each cross-group function import, scan the importing file's AST for call expressions where the callee is that imported symbol. This tells you:

- **Group A calls Group B** — data flows A→B via arguments.
- **Group B returns to Group A** — data flows B→A via return values.

### Output

```ts
interface EnrichedGroupEdge {
  from: string;
  to: string;
  weight: number;
  symbols: {
    name: string;
    kind: "type" | "function" | "class" | "constant" | "component";
    callDirection?: "calls" | "provides-callback";
  }[];
}
```

---

## Phase 6: Diff Analysis at the Group Level

### Goal

Given a git diff, produce a conceptual summary of what changed at the group level.

### Approach

1. Parse the diff to get a list of changed files (added, modified, deleted).
2. Map each changed file to its group.
3. Recompute the file-level import graph for changed files.
4. Diff the old and new group-level graphs:
   - New group edges (new cross-group dependency introduced).
   - Removed group edges (a dependency was eliminated).
   - Changed edge symbols (new symbols crossing a boundary, removed symbols).
5. Summarise affected groups and interface changes.

### Output

```
PR #142 affects:
  - Business Logic (3 files modified)
  - Data Models (1 file added)

Changed group interfaces:
  + Business Logic now imports `AuditLog` from Data Models (new dependency)
  ~ Business Logic → API Routes: `processOrder` return type changed
```

This is the killer feature for LLM-assisted development — it lets an LLM (or a developer) understand a PR in terms of architectural concepts rather than file lists.

---

## Phase 7: LLM Narrative Generation

### Goal

Turn the group graph into a human-readable description of the system's architecture and data flow.

### Approach

Send the enriched group graph (nodes, edges, symbol classifications, call directions) to the LLM and ask it to produce:

1. A one-paragraph architecture summary.
2. A data-flow narrative describing how data moves through the groups.

### Example output

> HTTP requests enter through **API Routes**, which extract and validate input. Validated data is passed to **Business Logic** services that apply domain rules. These services call **Data Models** to persist or retrieve data. Results flow back through Business Logic to API Routes, which serialise the response. **UI Components** consume API Routes via fetch calls and render the returned data.

This is a one-shot LLM call with well-structured input.

---

## What Is NOT Needed

| Technique | Why it's unnecessary |
|---|---|
| SSA / def-use chain analysis | Overkill — group-level flow is captured by import direction + call direction |
| Interprocedural dataflow | The "flow" at this abstraction is adequately described by which groups call into which |
| Control flow graphs | Not relevant at the group abstraction level |
| Tree-sitter (initially) | The TS Compiler API is strictly better for TypeScript; Tree-sitter matters when adding a second language |

---

## Build Order

| Phase | Deliverable | Depends on |
|---|---|---|
| 1 | File-level import graph extraction (TS) | — |
| 2 | Group config format + heuristic classifier | — |
| 3 | Group-level graph collapse | 1, 2 |
| 4 | LLM classification for ambiguous files | 2 |
| 5 | Cross-boundary symbol tracking | 1, 3 |
| 6 | Diff-on-groups | 3 |
| 7 | LLM narrative generation | 5 |

Phases 1 and 2 can be built in parallel. Phase 3 is the first point where the architectural view becomes usable. Phases 4-7 are incremental enrichments.
