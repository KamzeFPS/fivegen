CREATE TABLE `product_builder_order_snapshots` (
	`order_id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`publication_version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `commerce_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_product_builder_order_product` ON `product_builder_order_snapshots` (`product_id`);--> statement-breakpoint
CREATE TABLE `product_builder_publications` (
	`product_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`version` integer NOT NULL,
	`slug` text NOT NULL,
	`public_snapshot` text NOT NULL,
	`content_snapshot` text NOT NULL,
	`upload_ids` text DEFAULT '[]' NOT NULL,
	`published_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_product_builder_public_slug` ON `product_builder_publications` (`slug`);--> statement-breakpoint
CREATE TABLE `product_builder_workspaces` (
	`product_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_product_builder_owner` ON `product_builder_workspaces` (`owner`,`updated_at`);