CREATE TABLE `product_builder_revisions` (
 `product_id` text NOT NULL,
 `owner` text NOT NULL,
 `version` integer NOT NULL,
 `kind` text NOT NULL,
 `label` text NOT NULL,
 `data` text NOT NULL,
 `created_at` integer NOT NULL,
 PRIMARY KEY (`product_id`, `version`),
 FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_product_builder_revisions_owner` ON `product_builder_revisions` (`owner`, `product_id`, `version`);
