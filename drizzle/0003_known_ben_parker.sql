ALTER TABLE "pull_requests" ADD COLUMN "checks_count" integer;--> statement-breakpoint
ALTER TABLE "pull_requests" ADD COLUMN "checks_completed_count" integer;--> statement-breakpoint
CREATE TABLE "pull_request_check_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"repository" text NOT NULL,
	"pr_number" integer NOT NULL,
	"check_run_id" text NOT NULL,
	"status" text NOT NULL,
	"conclusion" text,
	"updated_at" bigint NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "pr_check_run_unique" ON "pull_request_check_runs" USING btree ("repository","pr_number","check_run_id");--> statement-breakpoint
CREATE INDEX "pr_check_run_lookup" ON "pull_request_check_runs" USING btree ("repository","pr_number");
