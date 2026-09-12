CREATE TABLE `paddle_adjustments` (
	`adjustment_id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`transaction_id` text NOT NULL,
	`action` text NOT NULL,
	`status` text NOT NULL,
	`total` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`event_time` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_paddle_adjustments_transaction` ON `paddle_adjustments` (`environment`,`transaction_id`);--> statement-breakpoint
CREATE TABLE `paddle_checkout_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`owner` text NOT NULL,
	`email` text NOT NULL,
	`price_id` text NOT NULL,
	`pack_id` text NOT NULL,
	`credits` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `paddle_customers` (
	`customer_id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`owner` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`event_time` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_paddle_customers_owner` ON `paddle_customers` (`environment`,`owner`);--> statement-breakpoint
CREATE TABLE `paddle_subscriptions` (
	`subscription_id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`customer_id` text NOT NULL,
	`status` text NOT NULL,
	`price_id` text NOT NULL,
	`product_id` text NOT NULL,
	`items` text NOT NULL,
	`scheduled_change_action` text,
	`scheduled_change_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`event_time` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `paddle_customers`(`customer_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_paddle_subscriptions_customer` ON `paddle_subscriptions` (`environment`,`customer_id`);--> statement-breakpoint
CREATE TABLE `paddle_test_wallets` (
	`owner` text PRIMARY KEY NOT NULL,
	`credits` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `paddle_transactions` (
	`transaction_id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`customer_id` text NOT NULL,
	`owner` text,
	`intent_id` text,
	`status` text NOT NULL,
	`currency` text NOT NULL,
	`total` text NOT NULL,
	`credits` integer DEFAULT 0 NOT NULL,
	`credited` integer DEFAULT 0 NOT NULL,
	`reversed` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`event_time` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `paddle_customers`(`customer_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_paddle_transactions_owner` ON `paddle_transactions` (`environment`,`owner`);--> statement-breakpoint
CREATE TABLE `paddle_webhook_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`event_type` text NOT NULL,
	`occurred_at` text NOT NULL,
	`processed_at` integer NOT NULL
);
