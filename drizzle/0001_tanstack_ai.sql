DROP TABLE `task_events`;
--> statement-breakpoint
DROP TABLE `task_messages`;
--> statement-breakpoint
CREATE TABLE `ai_messages` (
	`thread_id` text PRIMARY KEY NOT NULL,
	`messages_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`error` text,
	`error_code` text,
	`usage_json` text,
	`sandbox_key` text,
	`detached_since` integer,
	`cancel_requested` integer,
	`driver_epoch` integer
);
--> statement-breakpoint
CREATE INDEX `ai_run_thread` ON `ai_runs` (`thread_id`,`started_at`);
--> statement-breakpoint
CREATE INDEX `ai_run_status_detached` ON `ai_runs` (`status`,`detached_since`);
--> statement-breakpoint
CREATE TABLE `ai_interrupts` (
	`interrupt_id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`status` text NOT NULL,
	`requested_at` integer NOT NULL,
	`resolved_at` integer,
	`payload_json` text NOT NULL,
	`response_json` text
);
--> statement-breakpoint
CREATE INDEX `ai_interrupt_thread` ON `ai_interrupts` (`thread_id`,`requested_at`);
--> statement-breakpoint
CREATE TABLE `ai_metadata` (
	`scope` text NOT NULL,
	`key` text NOT NULL,
	`value_json` text NOT NULL,
	PRIMARY KEY(`scope`, `key`)
);
