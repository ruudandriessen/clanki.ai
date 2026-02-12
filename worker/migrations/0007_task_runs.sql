-- Task runs
CREATE TABLE `task_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `task_id` text NOT NULL REFERENCES `tasks`(`id`) ON DELETE CASCADE,
  `tool` text NOT NULL DEFAULT 'opencode',
  `status` text NOT NULL DEFAULT 'queued',
  `input_message_id` text REFERENCES `task_messages`(`id`) ON DELETE SET NULL,
  `output_message_id` text REFERENCES `task_messages`(`id`) ON DELETE SET NULL,
  `sandbox_id` text,
  `session_id` text,
  `error` text,
  `started_at` integer,
  `finished_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `task_run_task` ON `task_runs` (`task_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `task_run_status` ON `task_runs` (`status`, `created_at`);
--> statement-breakpoint

-- Task run events
CREATE TABLE `task_run_events` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL REFERENCES `task_runs`(`id`) ON DELETE CASCADE,
  `kind` text NOT NULL,
  `payload` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `task_run_event_run` ON `task_run_events` (`run_id`, `created_at`);
