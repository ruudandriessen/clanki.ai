CREATE TABLE "user_provider_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"auth_type" text DEFAULT 'api' NOT NULL,
	"encrypted_auth_json" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_provider_oauth_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"sandbox_id" text NOT NULL,
	"method" integer NOT NULL,
	"created_at" bigint NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "task_runs" ADD COLUMN "initiated_by_user_id" text;--> statement-breakpoint
ALTER TABLE "task_runs" ADD COLUMN "provider" text DEFAULT 'openai' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_runs" ADD COLUMN "model" text DEFAULT 'gpt-5.3-codex' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_provider_credentials" ADD CONSTRAINT "user_provider_credentials_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_provider_oauth_attempts" ADD CONSTRAINT "user_provider_oauth_attempts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_provider_unique" ON "user_provider_credentials" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "user_provider_user" ON "user_provider_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_provider_oauth_unique" ON "user_provider_oauth_attempts" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "user_provider_oauth_user" ON "user_provider_oauth_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "user_provider_oauth_exp" ON "user_provider_oauth_attempts" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_initiated_by_user_id_user_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_run_user" ON "task_runs" USING btree ("initiated_by_user_id","created_at");