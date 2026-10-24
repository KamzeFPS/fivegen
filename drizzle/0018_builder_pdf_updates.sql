CREATE TABLE `product_builder_upload_grants` (
	`order_id` text NOT NULL,
	`upload_id` text NOT NULL,
	`publication_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`order_id`, `upload_id`),
	FOREIGN KEY (`order_id`) REFERENCES `commerce_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`upload_id`) REFERENCES `uploads`(`id`) ON UPDATE no action ON DELETE no action
);
