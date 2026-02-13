ALTER TABLE `task_messages` ADD `organization_id` text;
--> statement-breakpoint
UPDATE `task_messages`
SET `organization_id` = `tasks`.`organization_id`
FROM `tasks`
WHERE `tasks`.`id` = `task_messages`.`task_id`;
--> statement-breakpoint
CREATE INDEX `task_message_org` ON `task_messages` (`organization_id`, `created_at`);
