DROP TABLE "user_provider_oauth_attempts" CASCADE;--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "sandbox_id";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "session_id";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "preview_url";