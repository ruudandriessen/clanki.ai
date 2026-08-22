import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

export const taskMessages = sqliteTable(
  "task_messages",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: msTimestamp("created_at").notNull(),
  },
  (t) => [index("task_message_task").on(t.taskId, t.createdAt)],
);

export const taskEvents = sqliteTable(
  "task_events",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    payload: text("payload").notNull(),
    createdAt: msTimestamp("created_at").notNull(),
  },
  (t) => [index("task_event_task").on(t.taskId, t.createdAt)],
);
