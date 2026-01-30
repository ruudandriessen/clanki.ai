import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  repoUrl: text("repo_url"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// Group definitions (project-level config)
// ---------------------------------------------------------------------------

export const groupDefinitions = sqliteTable(
  "group_definitions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
  },
  (t) => [uniqueIndex("group_def_project_name").on(t.projectId, t.name)],
);

// ---------------------------------------------------------------------------
// Group overrides (project-level config)
// ---------------------------------------------------------------------------

export const groupOverrides = sqliteTable("group_overrides", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  pattern: text("pattern").notNull(),
  groupName: text("group_name").notNull(),
  priority: integer("priority").notNull().default(0),
});

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

export const snapshots = sqliteTable(
  "snapshots",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    commitSha: text("commit_sha"),
    status: text("status").notNull().default("pending"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("snapshot_project_created").on(t.projectId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// File classifications
// ---------------------------------------------------------------------------

export const fileClassifications = sqliteTable(
  "file_classifications",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => snapshots.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    groupName: text("group_name").notNull(),
    strategy: text("strategy").notNull(),
  },
  (t) => [
    uniqueIndex("classification_snapshot_file").on(t.snapshotId, t.filePath),
    index("classification_snapshot_group").on(t.snapshotId, t.groupName),
  ],
);

// ---------------------------------------------------------------------------
// File edges
// ---------------------------------------------------------------------------

export const fileEdges = sqliteTable(
  "file_edges",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => snapshots.id, { onDelete: "cascade" }),
    fromFile: text("from_file").notNull(),
    toFile: text("to_file").notNull(),
    symbols: text("symbols").notNull().default("[]"),
  },
  (t) => [
    uniqueIndex("file_edge_unique").on(t.snapshotId, t.fromFile, t.toFile),
    index("file_edge_from").on(t.snapshotId, t.fromFile),
    index("file_edge_to").on(t.snapshotId, t.toFile),
  ],
);

// ---------------------------------------------------------------------------
// Group edges
// ---------------------------------------------------------------------------

export const groupEdges = sqliteTable(
  "group_edges",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => snapshots.id, { onDelete: "cascade" }),
    fromGroup: text("from_group").notNull(),
    toGroup: text("to_group").notNull(),
    weight: integer("weight").notNull(),
    symbols: text("symbols").notNull().default("[]"),
  },
  (t) => [uniqueIndex("group_edge_unique").on(t.snapshotId, t.fromGroup, t.toGroup)],
);

// ---------------------------------------------------------------------------
// Narratives (Phase 7)
// ---------------------------------------------------------------------------

export const narratives = sqliteTable(
  "narratives",
  {
    id: text("id").primaryKey(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => snapshots.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    content: text("content").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("narrative_snapshot_kind").on(t.snapshotId, t.kind)],
);
