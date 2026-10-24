CREATE TABLE `product_pages` (
  `product_id` text PRIMARY KEY NOT NULL,
  `owner` text NOT NULL,
  `draft` text NOT NULL,
  `published` text,
  `public_product` text,
  `published_at` integer,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_product_pages_owner` ON `product_pages` (`owner`);
--> statement-breakpoint
CREATE TABLE `product_reviews` (
  `id` text PRIMARY KEY NOT NULL,
  `product_id` text NOT NULL,
  `owner` text NOT NULL,
  `order_id` text NOT NULL,
  `email` text NOT NULL,
  `display_name` text NOT NULL,
  `rating` integer NOT NULL CHECK (`rating` BETWEEN 1 AND 5),
  `body` text NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_product_review_order` ON `product_reviews` (`order_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_product_review_buyer` ON `product_reviews` (`product_id`,`email`);
--> statement-breakpoint
CREATE INDEX `idx_product_reviews_product_date` ON `product_reviews` (`product_id`,`created_at`);
