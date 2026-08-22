CREATE TABLE `ai_stream_logs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`complete` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`run_id`) REFERENCES `ai_runs`(`run_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `ai_stream_chunks` (
	`run_id` text NOT NULL,
	`seq` integer NOT NULL,
	`chunk_json` text NOT NULL,
	PRIMARY KEY(`run_id`, `seq`),
	FOREIGN KEY (`run_id`) REFERENCES `ai_stream_logs`(`run_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_stream_chunk_run` ON `ai_stream_chunks` (`run_id`,`seq`);
