CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`repo_url` text NOT NULL,
	`setup_command` text,
	`run_command` text,
	`run_port` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `project_created` ON `projects` (`created_at`);--> statement-breakpoint
CREATE TABLE `task_events` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_event_task` ON `task_events` (`task_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `task_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_message_task` ON `task_messages` (`task_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`title` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`branch` text,
	`runner_type` text,
	`runner_session_id` text,
	`workspace_path` text,
	`error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `task_updated` ON `tasks` (`updated_at`);--> statement-breakpoint
CREATE INDEX `task_created` ON `tasks` (`created_at`);