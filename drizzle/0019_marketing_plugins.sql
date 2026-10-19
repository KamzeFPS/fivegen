CREATE TABLE `product_marketing_plugins` (
	`product_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`installed` text DEFAULT '[]' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_product_marketing_plugins_owner` ON `product_marketing_plugins` (`owner`);