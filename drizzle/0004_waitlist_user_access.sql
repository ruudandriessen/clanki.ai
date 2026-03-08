ALTER TABLE "user" ADD COLUMN "access_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
UPDATE "user" SET "access_status" = 'approved';--> statement-breakpoint
