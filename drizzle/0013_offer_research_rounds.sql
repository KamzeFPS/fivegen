CREATE TABLE `offer_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`owner` text NOT NULL,
	`revision` integer NOT NULL,
	`study` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_offer_round_revision` ON `offer_rounds` (`product_id`,`revision`);--> statement-breakpoint
CREATE INDEX `idx_offer_round_owner` ON `offer_rounds` (`owner`,`product_id`);