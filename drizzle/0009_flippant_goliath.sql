CREATE TABLE `credit_usage_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`usage_id` text NOT NULL,
	`grant_id` text NOT NULL,
	`amount` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_credit_usage_grants_usage` ON `credit_usage_grants` (`usage_id`);--> statement-breakpoint
CREATE TABLE `paddle_subscription_periods` (
	`transaction_id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`owner` text NOT NULL,
	`subscription_id` text NOT NULL,
	`price_id` text NOT NULL,
	`credits` integer NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_paddle_periods_owner` ON `paddle_subscription_periods` (`owner`,`environment`,`ends_at`);--> statement-breakpoint
CREATE TABLE `subscription_credit_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`environment` text NOT NULL,
	`transaction_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`credits` integer NOT NULL,
	`remaining` integer NOT NULL,
	`reversed` integer DEFAULT 0 NOT NULL,
	`starts_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_subscription_grants_owner` ON `subscription_credit_grants` (`owner`,`environment`,`expires_at`);--> statement-breakpoint
ALTER TABLE `paddle_checkout_intents` ADD `billing_interval` text;