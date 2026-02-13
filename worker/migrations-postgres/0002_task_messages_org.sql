ALTER TABLE "task_messages" ADD COLUMN "organization_id" text;
--> statement-breakpoint
UPDATE "task_messages"
SET "organization_id" = "tasks"."organization_id"
FROM "tasks"
WHERE "tasks"."id" = "task_messages"."task_id";
--> statement-breakpoint
ALTER TABLE "task_messages" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "task_messages" ADD CONSTRAINT "task_messages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "task_message_org" ON "task_messages" USING btree ("organization_id","created_at");
