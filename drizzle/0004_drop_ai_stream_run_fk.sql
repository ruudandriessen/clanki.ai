PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ai_stream_logs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`complete` integer DEFAULT 0 NOT NULL,
	`completed_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_ai_stream_logs`("run_id", "complete", "completed_at") SELECT "run_id", "complete", "completed_at" FROM `ai_stream_logs`;--> statement-breakpoint
DROP TABLE `ai_stream_logs`;--> statement-breakpoint
ALTER TABLE `__new_ai_stream_logs` RENAME TO `ai_stream_logs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
