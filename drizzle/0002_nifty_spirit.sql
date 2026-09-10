CREATE TABLE `ai_budget` (
	`day` text PRIMARY KEY NOT NULL,
	`reserved_micros` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `credit_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`credits` integer NOT NULL,
	`amount` integer NOT NULL,
	`payment_intent` text,
	`state` text DEFAULT 'pending' NOT NULL,
	`reversed` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `credit_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`operation` text NOT NULL,
	`cost` integer NOT NULL,
	`state` text NOT NULL,
	`starter_used` integer NOT NULL,
	`included_used` integer NOT NULL,
	`purchased_used` integer NOT NULL,
	`cycle` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_credit_usage_owner_date` ON `credit_usage` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `platform_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`amount` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wallets` (
	`owner` text PRIMARY KEY NOT NULL,
	`starter` integer DEFAULT 1200 NOT NULL,
	`included` integer DEFAULT 0 NOT NULL,
	`purchased` integer DEFAULT 0 NOT NULL,
	`cycle` text DEFAULT '' NOT NULL,
	`expires` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `checkout_intents` ADD `platform_fee` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `generation` ADD `attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `memberships` ADD `period_start` integer;--> statement-breakpoint
ALTER TABLE `orders` ADD `platform_fee` integer DEFAULT 0 NOT NULL;