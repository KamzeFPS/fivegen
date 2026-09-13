CREATE TABLE `studio_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`messages` text DEFAULT '[]' NOT NULL,
	`plan` text,
	`product_id` text,
	`lease` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_studio_conversations_owner` ON `studio_conversations` (`owner`,`updated_at`);--> statement-breakpoint
CREATE TABLE `studio_plan_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`conversation_id` text NOT NULL,
	`prompt` text NOT NULL,
	`period` text NOT NULL,
	`mode` text NOT NULL,
	`state` text NOT NULL,
	`response` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_studio_plan_turns_owner` ON `studio_plan_turns` (`owner`,`period`);