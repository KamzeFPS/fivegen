CREATE TABLE `growth_funnel_drafts` (
 `product_id` text PRIMARY KEY NOT NULL REFERENCES `products`(`id`) ON DELETE CASCADE,
 `owner` text NOT NULL,
 `creator_vsl_upload_id` text,
 `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_growth_funnel_drafts_owner` ON `growth_funnel_drafts` (`owner`);
