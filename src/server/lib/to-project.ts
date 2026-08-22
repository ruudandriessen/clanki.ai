import type { Project } from "@/lib/project";
import type { projects } from "../db/schema";

export function toProject(row: typeof projects.$inferSelect): Project {
  return {
    id: row.id,
    name: row.name,
    repo_url: row.repoUrl,
    setup_command: row.setupCommand,
    run_command: row.runCommand,
    run_port: row.runPort,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
