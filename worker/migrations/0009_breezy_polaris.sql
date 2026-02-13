ALTER TABLE `user_provider_credentials` ADD `auth_type` text NOT NULL DEFAULT 'api';
--> statement-breakpoint
ALTER TABLE `user_provider_credentials` ADD `encrypted_auth_json` text;
--> statement-breakpoint
CREATE TABLE `user_provider_oauth_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider` text NOT NULL,
	`sandbox_id` text NOT NULL,
	`method` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_provider_oauth_unique` ON `user_provider_oauth_attempts` (`user_id`,`provider`);
--> statement-breakpoint
CREATE INDEX `user_provider_oauth_user` ON `user_provider_oauth_attempts` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `user_provider_oauth_exp` ON `user_provider_oauth_attempts` (`expires_at`);
