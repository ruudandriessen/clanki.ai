import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

const msTimestamp = (name: string) => integer(name, { mode: "number" });

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    repoUrl: text("repo_url").notNull(),
    setupCommand: text("setup_command"),
    runCommand: text("run_command"),
    runPort: integer("run_port"),
    createdAt: msTimestamp("created_at").notNull(),
    updatedAt: msTimestamp("updated_at").notNull(),
  },
  (t) => [index("project_created").on(t.createdAt)],
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    status: text("status").notNull().default("open"),
    branch: text("branch"),
    runnerType: text("runner_type"),
    runnerSessionId: text("runner_session_id"),
    workspacePath: text("workspace_path"),
    error: text("error"),
    createdAt: msTimestamp("created_at").notNull(),
    updatedAt: msTimestamp("updated_at").notNull(),
  },
  (t) => [index("task_updated").on(t.updatedAt), index("task_created").on(t.createdAt)],
);

export const aiMessages = sqliteTable("ai_messages", {
  threadId: text("thread_id").primaryKey(),
  messagesJson: text("messages_json").notNull(),
});

export const aiRuns = sqliteTable(
  "ai_runs",
  {
    runId: text("run_id").primaryKey(),
    threadId: text("thread_id").notNull(),
    status: text("status").notNull(),
    startedAt: msTimestamp("started_at").notNull(),
    finishedAt: msTimestamp("finished_at"),
    error: text("error"),
    errorCode: text("error_code"),
    usageJson: text("usage_json"),
    sandboxKey: text("sandbox_key"),
    detachedSince: integer("detached_since", { mode: "number" }),
    cancelRequested: integer("cancel_requested", { mode: "number" }),
    driverEpoch: integer("driver_epoch", { mode: "number" }),
  },
  (t) => [
    index("ai_run_thread").on(t.threadId, t.startedAt),
    index("ai_run_status_detached").on(t.status, t.detachedSince),
  ],
);

export const aiInterrupts = sqliteTable(
  "ai_interrupts",
  {
    interruptId: text("interrupt_id").primaryKey(),
    runId: text("run_id").notNull(),
    threadId: text("thread_id").notNull(),
    status: text("status").notNull(),
    requestedAt: msTimestamp("requested_at").notNull(),
    resolvedAt: msTimestamp("resolved_at"),
    payloadJson: text("payload_json").notNull(),
    responseJson: text("response_json"),
  },
  (t) => [index("ai_interrupt_thread").on(t.threadId, t.requestedAt)],
);

export const aiMetadata = sqliteTable(
  "ai_metadata",
  {
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    valueJson: text("value_json").notNull(),
  },
  (t) => [primaryKey({ columns: [t.scope, t.key] })],
);
