ALTER TABLE "pull_requests" ADD COLUMN "review_state" text;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "review_updated_at" bigint;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "checks_state" text;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "checks_conclusion" text;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "checks_updated_at" bigint;