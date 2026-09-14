CREATE TABLE `wallet_charge_state` (
	`charge_id` text PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`payment_intent` text NOT NULL,
	`amount` integer NOT NULL,
	`reversed_amount` integer NOT NULL,
	`event_time` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wallet_checkout_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`environment` text NOT NULL,
	`offer_id` text NOT NULL,
	`email` text NOT NULL,
	`amount` integer NOT NULL,
	`credits` integer NOT NULL,
	`billing_interval` text,
	`session_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_checkout_intents_session_id_unique` ON `wallet_checkout_intents` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_wallet_open_checkout` ON `wallet_checkout_intents` (`owner`,`environment`) WHERE "wallet_checkout_intents"."status" = 'open';--> statement-breakpoint
CREATE TABLE `wallet_customers` (
	`key` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`environment` text NOT NULL,
	`customer_id` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_customers_customer_id_unique` ON `wallet_customers` (`customer_id`);--> statement-breakpoint
CREATE TABLE `wallet_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`environment` text NOT NULL,
	`intent_id` text NOT NULL,
	`payment_intent` text,
	`subscription_id` text,
	`amount` integer NOT NULL,
	`credits` integer NOT NULL,
	`credited` integer DEFAULT 0 NOT NULL,
	`reversed` integer DEFAULT 0 NOT NULL,
	`starts_at` integer,
	`ends_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_payments_payment_intent_unique` ON `wallet_payments` (`payment_intent`);--> statement-breakpoint
CREATE INDEX `idx_wallet_payments_owner` ON `wallet_payments` (`owner`,`environment`);--> statement-breakpoint
CREATE TABLE `wallet_subscriptions` (
	`subscription_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`environment` text NOT NULL,
	`customer_id` text NOT NULL,
	`intent_id` text NOT NULL,
	`status` text NOT NULL,
	`cancel_at` integer,
	`period_end` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_wallet_subscriptions_owner` ON `wallet_subscriptions` (`owner`,`environment`);--> statement-breakpoint
CREATE TABLE `wallet_test_balances` (
	`owner` text PRIMARY KEY NOT NULL,
	`credits` integer DEFAULT 0 NOT NULL
);
