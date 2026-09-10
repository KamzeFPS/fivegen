CREATE TABLE `checkout_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product_id` text NOT NULL,
	`account` text NOT NULL,
	`amount` integer NOT NULL,
	`mode` text NOT NULL,
	`items` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`session_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkout_intents_session_id_unique` ON `checkout_intents` (`session_id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`owner` text PRIMARY KEY NOT NULL,
	`customer_id` text,
	`subscription_id` text,
	`status` text DEFAULT 'free' NOT NULL,
	`interval` text,
	`period_end` integer,
	`cancel_at_period_end` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_subscription_id_unique` ON `memberships` (`subscription_id`);--> statement-breakpoint
ALTER TABLE `orders` ADD `items` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `subscription_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `customer_id` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `stripe_account` text;--> statement-breakpoint
ALTER TABLE `products` ADD `commerce` text DEFAULT '{}' NOT NULL;