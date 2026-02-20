ALTER TABLE "pull_requests" ADD COLUMN "state" text DEFAULT 'open' NOT NULL;
UPDATE "pull_requests" SET "state" = 'merged' WHERE "merged_at" IS NOT NULL;
