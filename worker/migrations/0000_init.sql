CREATE TABLE `file_classifications` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text NOT NULL,
	`file_path` text NOT NULL,
	`group_name` text NOT NULL,
	`strategy` text NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classification_snapshot_file` ON `file_classifications` (`snapshot_id`,`file_path`);--> statement-breakpoint
CREATE INDEX `classification_snapshot_group` ON `file_classifications` (`snapshot_id`,`group_name`);--> statement-breakpoint
CREATE TABLE `file_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text NOT NULL,
	`from_file` text NOT NULL,
	`to_file` text NOT NULL,
	`symbols` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_edge_unique` ON `file_edges` (`snapshot_id`,`from_file`,`to_file`);--> statement-breakpoint
CREATE INDEX `file_edge_from` ON `file_edges` (`snapshot_id`,`from_file`);--> statement-breakpoint
CREATE INDEX `file_edge_to` ON `file_edges` (`snapshot_id`,`to_file`);--> statement-breakpoint
CREATE TABLE `group_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_def_project_name` ON `group_definitions` (`project_id`,`name`);--> statement-breakpoint
CREATE TABLE `group_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text NOT NULL,
	`from_group` text NOT NULL,
	`to_group` text NOT NULL,
	`weight` integer NOT NULL,
	`symbols` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_edge_unique` ON `group_edges` (`snapshot_id`,`from_group`,`to_group`);--> statement-breakpoint
CREATE TABLE `group_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`pattern` text NOT NULL,
	`group_name` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `narratives` (
	`id` text PRIMARY KEY NOT NULL,
	`snapshot_id` text NOT NULL,
	`kind` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`snapshot_id`) REFERENCES `snapshots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `narrative_snapshot_kind` ON `narratives` (`snapshot_id`,`kind`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`repo_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`commit_sha` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `snapshot_project_created` ON `snapshots` (`project_id`,`created_at`);