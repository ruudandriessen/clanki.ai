DROP TABLE "task_runs" CASCADE;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "sandbox_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "stream_id" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "error" text;