# Database Schema Design

Storage layer for persisting graph extraction results using Cloudflare D1 (SQLite) with Drizzle ORM.

---

## Technology Choice

| | Choice | Rationale |
|---|---|---|
| **Database** | Cloudflare D1 | SQLite at the edge, zero-config, native Workers binding |
| **ORM** | Drizzle | Lightweight, first-class D1 support, typed queries, generates migrations |
| **IDs** | Text (nanoid) | URL-friendly, no enumeration, portable across environments |

---

## Schema

### `projects`

A repository or codebase being analysed.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | nanoid |
| `name` | TEXT | NOT NULL | Display name |
| `repo_url` | TEXT | | Optional remote URL |
| `created_at` | INTEGER | NOT NULL | Unix timestamp (ms) |
| `updated_at` | INTEGER | NOT NULL | Unix timestamp (ms) |

---

### `group_definitions`

User-defined semantic groups for a project. Project-level config — not tied to individual snapshots.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | nanoid |
| `project_id` | TEXT | NOT NULL, FK → projects(id) ON DELETE CASCADE | |
| `name` | TEXT | NOT NULL | e.g. "UI Components" |
| `description` | TEXT | NOT NULL | Used by heuristics and LLM |

**Unique:** `(project_id, name)`

---

### `group_overrides`

Glob patterns pinned to specific groups. Take priority over heuristic and LLM classification.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | nanoid |
| `project_id` | TEXT | NOT NULL, FK → projects(id) ON DELETE CASCADE | |
| `pattern` | TEXT | NOT NULL | Glob relative to project root |
| `group_name` | TEXT | NOT NULL | Must reference a defined group |
| `priority` | INTEGER | NOT NULL, DEFAULT 0 | Higher = matched first |

---

### `snapshots`

A point-in-time analysis run. Each time the graph extraction pipeline runs for a project, it creates a snapshot. Comparing snapshots enables Phase 6 diff analysis.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | nanoid |
| `project_id` | TEXT | NOT NULL, FK → projects(id) ON DELETE CASCADE | |
| `commit_sha` | TEXT | | Git commit hash, nullable |
| `status` | TEXT | NOT NULL, DEFAULT 'pending' | `pending` · `running` · `completed` · `failed` |
| `created_at` | INTEGER | NOT NULL | Unix timestamp (ms) |

---

### `file_classifications`

Maps each source file to a group within a snapshot.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | nanoid |
| `snapshot_id` | TEXT | NOT NULL, FK → snapshots(id) ON DELETE CASCADE | |
| `file_path` | TEXT | NOT NULL | Relative to project root |
| `group_name` | TEXT | NOT NULL | Assigned group |
| `strategy` | TEXT | NOT NULL | `override` · `heuristic` · `llm` · `default` |

**Unique:** `(snapshot_id, file_path)`

Maps directly to `FileClassification` in `graph/src/types.ts`. Paths stored relative (not absolute) for portability.

---

### `file_edges`

Import relationships between source files within a snapshot.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | nanoid |
| `snapshot_id` | TEXT | NOT NULL, FK → snapshots(id) ON DELETE CASCADE | |
| `from_file` | TEXT | NOT NULL | Relative path of importing file |
| `to_file` | TEXT | NOT NULL | Relative path of imported file |
| `symbols` | TEXT | NOT NULL, DEFAULT '[]' | JSON array of symbol names |

**Unique:** `(snapshot_id, from_file, to_file)`

Symbols stored as a JSON text column. This is a pragmatic choice — symbol lists on file edges are read as a unit and don't need individual querying. Maps to `FileEdge` in `graph/src/types.ts`.

---

### `group_edges`

Collapsed group-level dependency edges within a snapshot.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | nanoid |
| `snapshot_id` | TEXT | NOT NULL, FK → snapshots(id) ON DELETE CASCADE | |
| `from_group` | TEXT | NOT NULL | Source group name |
| `to_group` | TEXT | NOT NULL | Target group name |
| `weight` | INTEGER | NOT NULL | Count of contributing file edges |
| `symbols` | TEXT | NOT NULL, DEFAULT '[]' | JSON array of deduplicated symbols |

**Unique:** `(snapshot_id, from_group, to_group)`

Maps to `GroupEdge` in `graph/src/types.ts`. Like file edges, symbols are stored as JSON for now. Phase 5 enrichment (symbol kind, call direction) will require migrating to a junction table — see [Future: Phase 5](#future-phase-5-enriched-symbols).

---

### `narratives`

LLM-generated architecture descriptions for a snapshot (Phase 7).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | TEXT | PRIMARY KEY | nanoid |
| `snapshot_id` | TEXT | NOT NULL, FK → snapshots(id) ON DELETE CASCADE | |
| `kind` | TEXT | NOT NULL | `summary` · `data_flow` |
| `content` | TEXT | NOT NULL | Markdown text |
| `created_at` | INTEGER | NOT NULL | Unix timestamp (ms) |

**Unique:** `(snapshot_id, kind)`

Not needed until Phase 7, but included in the schema now since it's trivial and avoids a future migration for a known requirement.

---

## Entity Relationship Diagram

```
projects
  │
  ├──< group_definitions    (project-level config)
  ├──< group_overrides       (project-level config)
  │
  └──< snapshots
        │
        ├──< file_classifications
        ├──< file_edges
        ├──< group_edges
        └──< narratives
```

All child tables cascade-delete from their parent. Deleting a project removes everything. Deleting a snapshot removes its analysis results but preserves project config.

---

## Design Decisions

### Snapshots vs mutable state

Analysis results are immutable per-run. Each pipeline execution creates a new snapshot rather than updating in place. This enables:

- **Diff analysis** (Phase 6) by comparing two snapshots
- **History** of how architecture evolves over time
- **Safe re-runs** — a failed analysis doesn't corrupt previous results

### Group config is project-level, not snapshot-level

Groups and overrides are user configuration, not analysis output. They live on the project and apply to all future snapshots. If users change group definitions between runs, the new snapshot reflects the new config. Old snapshots retain their historical classifications.

### Relative file paths

`types.ts` uses absolute paths. The database stores paths relative to the project root. The conversion happens at the storage boundary — write time strips the project root prefix, read time prepends it. This makes data portable across machines and environments.

### Symbols as JSON vs junction table

File edge symbols are stored as a JSON text column rather than a separate table. Rationale:

- Symbols on a file edge are always read/written as a unit
- No need to query "find all edges importing symbol X" at the file level
- Avoids N+1 queries and join overhead for the most common read path
- The symbol list per edge is small (typically <20 items)

Group edge symbols use the same approach initially but will migrate to a junction table when Phase 5 adds per-symbol metadata (kind, call direction).

### Strategy enum includes `llm`

The `strategy` column on file_classifications accepts `llm` in addition to the existing `override | heuristic | default`. This prepares for Phase 4 without requiring a migration.

---

## Indexes

Beyond the primary keys and unique constraints (which SQLite indexes automatically):

| Table | Index | Purpose |
|---|---|---|
| `snapshots` | `(project_id, created_at DESC)` | List snapshots for a project, newest first |
| `file_classifications` | `(snapshot_id, group_name)` | List files in a group (for drill-down) |
| `file_edges` | `(snapshot_id, from_file)` | Find all imports from a file |
| `file_edges` | `(snapshot_id, to_file)` | Find all importers of a file |

---

## Future: Phase 5 Enriched Symbols

When Phase 5 lands, `group_edges.symbols` (JSON column) gets replaced by a junction table:

### `group_edge_symbols`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `edge_id` | TEXT | NOT NULL, FK → group_edges(id) ON DELETE CASCADE | |
| `symbol` | TEXT | NOT NULL | Symbol name |
| `kind` | TEXT | | `type` · `function` · `class` · `constant` · `component` |
| `call_direction` | TEXT | | `calls` · `provides_callback` |

**Primary key:** `(edge_id, symbol)`

This is a known future migration, not part of the initial schema. The JSON column approach works until then.

---

## Drizzle Setup

Dependencies to add:

```
drizzle-orm
drizzle-kit
```

Schema file location: `worker/src/db/schema.ts`

Migration output: `worker/migrations/`

Drizzle config: `drizzle.config.ts` at repo root

D1 binding to add to `wrangler.json`:

```json
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "clanki-db",
      "database_id": "<created via wrangler d1 create>"
    }
  ]
}
```

Worker `Bindings` type update:

```ts
type Bindings = {
  ASSETS: Fetcher;
  DB: D1Database;
};
```

---

## Query Patterns

Common queries the API layer will need:

| Query | Tables | Notes |
|---|---|---|
| List projects | `projects` | Simple select, ordered by `updated_at` |
| Get project with config | `projects` + `group_definitions` + `group_overrides` | Join or two queries |
| List snapshots | `snapshots` | Filter by `project_id`, order by `created_at DESC` |
| Get group graph | `group_edges` | Filter by `snapshot_id` |
| Get file graph | `file_edges` | Filter by `snapshot_id` |
| Get classifications | `file_classifications` | Filter by `snapshot_id`, optionally by `group_name` |
| Drill into group edge | `file_edges` + `file_classifications` | Find file edges where `from_file` is in group A and `to_file` is in group B |
| Compare snapshots | Two `group_edges` queries | Diff computed in application code |
