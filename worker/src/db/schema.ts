import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const msTimestamp = (name: string) => bigint(name, { mode: "number" });

// ---------------------------------------------------------------------------
// Auth (BetterAuth)
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt", { withTimezone: true, mode: "date" }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  activeOrganizationId: text("activeOrganizationId"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).notNull(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { withTimezone: true, mode: "date" }),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { withTimezone: true, mode: "date" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }),
});

// ---------------------------------------------------------------------------
// User provider credentials
// ---------------------------------------------------------------------------

export const userProviderCredentials = pgTable(
  "user_provider_credentials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    authType: text("auth_type").notNull().default("api"),
    encryptedAuthJson: text("encrypted_auth_json"),
    createdAt: msTimestamp("created_at").notNull(),
    updatedAt: msTimestamp("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("user_provider_unique").on(t.userId, t.provider),
    index("user_provider_user").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// User provider OAuth attempts
// ---------------------------------------------------------------------------

export const userProviderOauthAttempts = pgTable(
  "user_provider_oauth_attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    sandboxId: text("sandbox_id").notNull(),
    method: integer("method").notNull(),
    createdAt: msTimestamp("created_at").notNull(),
    expiresAt: msTimestamp("expires_at").notNull(),
  },
  (t) => [
    uniqueIndex("user_provider_oauth_unique").on(t.userId, t.provider),
    index("user_provider_oauth_user").on(t.userId, t.createdAt),
    index("user_provider_oauth_exp").on(t.expiresAt),
  ],
);

// ---------------------------------------------------------------------------
// Organizations (BetterAuth)
// ---------------------------------------------------------------------------

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).notNull(),
  metadata: text("metadata"),
});

export const member = pgTable("member", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).notNull(),
});

export const invitation = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organizationId")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expiresAt", { withTimezone: true, mode: "date" }).notNull(),
  inviterId: text("inviterId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).notNull(),
});

// ---------------------------------------------------------------------------
// Installations (GitHub App)
// ---------------------------------------------------------------------------

export const installations = pgTable("installations", {
  installationId: integer("installation_id").primaryKey(),
  accountLogin: text("account_login").notNull(),
  accountType: text("account_type").notNull(),
  createdAt: msTimestamp("created_at").notNull(),
  deletedAt: msTimestamp("deleted_at"),
  updatedAt: msTimestamp("updated_at"),
});

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    repoUrl: text("repo_url"),
    installationId: integer("installation_id").references(() => installations.installationId, {
      onDelete: "set null",
    }),
    setupCommand: text("setup_command"),
    createdAt: msTimestamp("created_at").notNull(),
    updatedAt: msTimestamp("updated_at").notNull(),
  },
  (t) => [index("project_org").on(t.organizationId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Pull requests
// ---------------------------------------------------------------------------

export const pullRequests = pgTable(
  "pull_requests",
  {
    id: text("id").primaryKey(),
    installationId: integer("installation_id")
      .notNull()
      .references(() => installations.installationId, { onDelete: "cascade" }),
    repository: text("repository").notNull(),
    prNumber: integer("pr_number").notNull(),
    openedAt: msTimestamp("opened_at").notNull(),
    mergedBy: text("merged_by"),
    mergedAt: msTimestamp("merged_at"),
    readyAt: msTimestamp("ready_at"),
  },
  (t) => [
    uniqueIndex("pr_repo_number").on(t.repository, t.prNumber),
    index("pr_installation").on(t.installationId),
  ],
);

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: msTimestamp("created_at").notNull(),
    updatedAt: msTimestamp("updated_at").notNull(),
  },
  (t) => [index("task_org").on(t.organizationId, t.createdAt)],
);

// ---------------------------------------------------------------------------
// Task messages
// ---------------------------------------------------------------------------

export const taskMessages = pgTable(
  "task_messages",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: msTimestamp("created_at").notNull(),
  },
  (t) => [
    index("task_message_org").on(t.organizationId, t.createdAt),
    index("task_message_task").on(t.taskId, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Task runs
// ---------------------------------------------------------------------------

export const taskRuns = pgTable(
  "task_runs",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    tool: text("tool").notNull().default("opencode"),
    status: text("status").notNull().default("queued"),
    inputMessageId: text("input_message_id").references(() => taskMessages.id, {
      onDelete: "set null",
    }),
    outputMessageId: text("output_message_id").references(() => taskMessages.id, {
      onDelete: "set null",
    }),
    sandboxId: text("sandbox_id"),
    sessionId: text("session_id"),
    initiatedByUserId: text("initiated_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    provider: text("provider").notNull().default("openai"),
    model: text("model").notNull().default("gpt-5.3-codex"),
    error: text("error"),
    startedAt: msTimestamp("started_at"),
    finishedAt: msTimestamp("finished_at"),
    createdAt: msTimestamp("created_at").notNull(),
    updatedAt: msTimestamp("updated_at").notNull(),
  },
  (t) => [
    index("task_run_task").on(t.taskId, t.createdAt),
    index("task_run_status").on(t.status, t.createdAt),
    index("task_run_user").on(t.initiatedByUserId, t.createdAt),
  ],
);
