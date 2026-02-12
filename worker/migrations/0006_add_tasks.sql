-- Tasks
CREATE TABLE `tasks` (
  `id` text PRIMARY KEY NOT NULL,
  `organization_id` text NOT NULL REFERENCES `organization`(`id`) ON DELETE CASCADE,
  `project_id` text REFERENCES `projects`(`id`) ON DELETE SET NULL,
  `title` text NOT NULL,
  `status` text NOT NULL DEFAULT 'open',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `task_org` ON `tasks` (`organization_id`, `created_at`);
--> statement-breakpoint

-- Task messages
CREATE TABLE `task_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `task_id` text NOT NULL REFERENCES `tasks`(`id`) ON DELETE CASCADE,
  `role` text NOT NULL,
  `content` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `task_message_task` ON `task_messages` (`task_id`, `created_at`);
