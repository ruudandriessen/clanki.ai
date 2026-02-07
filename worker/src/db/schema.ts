import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Auth (BetterAuth)
// ---------------------------------------------------------------------------

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull(),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  activeOrganizationId: text("activeOrganizationId"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }),
  updatedAt: integer("updatedAt", { mode: "timestamp" }),
});

// ---------------------------------------------------------------------------
// Organizations (BetterAuth)
// ---------------------------------------------------------------------------

export const organization = sqliteTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  metadata: text("metadata"),
});

export const member = sqliteTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
});

export const invitation = sqliteTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull().default("pending"),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  inviterId: text("inviterId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
});

// ---------------------------------------------------------------------------
// Installations (GitHub App)
// ---------------------------------------------------------------------------

export const installations = sqliteTable("installations", {
  installationId: integer("installation_id").primaryKey(),
  accountLogin: text("account_login").notNull(),
  accountType: text("account_type").notNull(),
  createdAt: integer("created_at").notNull(),
  deletedAt: integer("deleted_at"),
  updatedAt: integer("updated_at"),
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  repoUrl: text("repo_url"),
  installationId: integer("installation_id").references(() => installations.installationId, {
    onDelete: "set null",
  }),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// ---------------------------------------------------------------------------
// Pull requests
// ---------------------------------------------------------------------------

export const pullRequests = sqliteTable(
  "pull_requests",
  {
    id: text("id").primaryKey(),
    installationId: integer("installation_id")
      .notNull()
      .references(() => installations.installationId, { onDelete: "cascade" }),
    repository: text("repository").notNull(),
    prNumber: integer("pr_number").notNull(),
    openedAt: integer("opened_at").notNull(),
    mergedBy: text("merged_by"),
    mergedAt: integer("merged_at"),
    readyAt: integer("ready_at"),
  },
  (t) => [
    uniqueIndex("pr_repo_number").on(t.repository, t.prNumber),
    index("pr_installation").on(t.installationId),
  ],
);

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
    pullRequestId: text("pull_request_id").references(() => pullRequests.id, {
      onDelete: "set null",
    }),
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
