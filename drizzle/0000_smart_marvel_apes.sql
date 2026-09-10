CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`prompt` text NOT NULL,
	`status` text NOT NULL,
	`remote` text,
	`object_key` text,
	`error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_assets_product_owner` ON `assets` (`product_id`,`owner`);--> statement-breakpoint
CREATE TABLE `generation` (
	`product_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`brief` text NOT NULL,
	`stage` integer DEFAULT -1 NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`lease` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`owner` text NOT NULL,
	`email` text NOT NULL,
	`amount` integer NOT NULL,
	`provider` text NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_token_unique` ON `orders` (`token`);--> statement-breakpoint
CREATE INDEX `idx_orders_owner_date` ON `orders` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`audience` text NOT NULL,
	`format` text NOT NULL,
	`price` integer DEFAULT 0 NOT NULL,
	`color` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`whop_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_products_owner` ON `products` (`owner`);--> statement-breakpoint
CREATE TABLE `providers` (
	`owner` text PRIMARY KEY NOT NULL,
	`openai` text,
	`anthropic` text,
	`fal` text,
	`config` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sellers` (
	`owner` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT 'My studio' NOT NULL,
	`stripe_account` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `visits` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`owner` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_visits_owner_date` ON `visits` (`owner`,`created_at`);