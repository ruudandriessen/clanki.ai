PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ai_messages` (
	`thread_id` text PRIMARY KEY NOT NULL,
	`messages_json` text NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_ai_messages`("thread_id", "messages_json") SELECT "thread_id", "messages_json" FROM `ai_messages`;--> statement-breakpoint
DROP TABLE `ai_messages`;--> statement-breakpoint
ALTER TABLE `__new_ai_messages` RENAME TO `ai_messages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_ai_runs` (
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
	`driver_epoch` integer,
	FOREIGN KEY (`thread_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_ai_runs`("run_id", "thread_id", "status", "started_at", "finished_at", "error", "error_code", "usage_json", "sandbox_key", "detached_since", "cancel_requested", "driver_epoch") SELECT "run_id", "thread_id", "status", "started_at", "finished_at", "error", "error_code", "usage_json", "sandbox_key", "detached_since", "cancel_requested", "driver_epoch" FROM `ai_runs`;--> statement-breakpoint
DROP TABLE `ai_runs`;--> statement-breakpoint
ALTER TABLE `__new_ai_runs` RENAME TO `ai_runs`;--> statement-breakpoint
CREATE INDEX `ai_run_thread` ON `ai_runs` (`thread_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `ai_run_status_detached` ON `ai_runs` (`status`,`detached_since`);--> statement-breakpoint
CREATE TABLE `__new_ai_interrupts` (
	`interrupt_id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`status` text NOT NULL,
	`requested_at` integer NOT NULL,
	`resolved_at` integer,
	`payload_json` text NOT NULL,
	`response_json` text,
	FOREIGN KEY (`thread_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_ai_interrupts`("interrupt_id", "run_id", "thread_id", "status", "requested_at", "resolved_at", "payload_json", "response_json") SELECT "interrupt_id", "run_id", "thread_id", "status", "requested_at", "resolved_at", "payload_json", "response_json" FROM `ai_interrupts`;--> statement-breakpoint
DROP TABLE `ai_interrupts`;--> statement-breakpoint
ALTER TABLE `__new_ai_interrupts` RENAME TO `ai_interrupts`;--> statement-breakpoint
CREATE INDEX `ai_interrupt_thread` ON `ai_interrupts` (`thread_id`,`requested_at`);