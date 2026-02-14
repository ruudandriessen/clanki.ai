DROP TABLE IF EXISTS "task_run_events" CASCADE;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "setup_command" text;
