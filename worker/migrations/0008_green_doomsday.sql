ALTER TABLE `task_runs` ADD `initiated_by_user_id` text REFERENCES `user`(`id`) ON DELETE set null;
--> statement-breakpoint
ALTER TABLE `task_runs` ADD `provider` text NOT NULL DEFAULT 'openai';
--> statement-breakpoint
ALTER TABLE `task_runs` ADD `model` text NOT NULL DEFAULT 'gpt-5.3-codex';
--> statement-breakpoint
CREATE INDEX `task_run_user` ON `task_runs` (`initiated_by_user_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `user_provider_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`encrypted_api_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_provider_unique` ON `user_provider_credentials` (`user_id`,`provider`);--> statement-breakpoint
CREATE INDEX `user_provider_user` ON `user_provider_credentials` (`user_id`);
