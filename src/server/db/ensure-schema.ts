import type { Client } from "@libsql/client";

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    repo_url TEXT NOT NULL,
    setup_command TEXT,
    run_command TEXT,
    run_port INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS project_created ON projects (created_at)`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    branch TEXT,
    runner_type TEXT,
    runner_session_id TEXT,
    workspace_path TEXT,
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS task_updated ON tasks (updated_at)`,
  `CREATE INDEX IF NOT EXISTS task_created ON tasks (created_at)`,
  `CREATE TABLE IF NOT EXISTS task_messages (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS task_message_task ON task_messages (task_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS task_events (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS task_event_task ON task_events (task_id, created_at)`,
];

export async function ensureSchema(client: Client): Promise<void> {
  await client.execute("PRAGMA foreign_keys = ON");
  for (const statement of SCHEMA_STATEMENTS) {
    await client.execute(statement);
  }
}
