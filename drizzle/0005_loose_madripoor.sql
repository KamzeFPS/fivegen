CREATE TABLE `booking_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product_id` text NOT NULL,
	`starts_at` integer NOT NULL,
	`duration` integer NOT NULL,
	`booking_id` text
);
--> statement-breakpoint
CREATE INDEX `idx_slots_product_date` ON `booking_slots` (`product_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product_id` text NOT NULL,
	`slot_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_bookings_owner` ON `bookings` (`owner`);--> statement-breakpoint
CREATE INDEX `idx_bookings_user` ON `bookings` (`user_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `community_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`body` text NOT NULL,
	`parent_id` text,
	`pinned` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_posts_product_date` ON `community_posts` (`product_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`marketing` integer DEFAULT 0 NOT NULL,
	`source` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_leads_owner_date` ON `leads` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `lesson_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`user_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`completed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_progress_user_product` ON `lesson_progress` (`user_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `referral_commissions` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`invite_id` text NOT NULL,
	`owner` text NOT NULL,
	`partner` text NOT NULL,
	`product_id` text NOT NULL,
	`amount` integer NOT NULL,
	`percent` integer NOT NULL,
	`account` text NOT NULL,
	`payment_intent` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`available_at` integer NOT NULL,
	`transfer_id` text,
	`payout_started_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `referral_commissions_order_id_unique` ON `referral_commissions` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_commissions_partner` ON `referral_commissions` (`partner`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_commissions_owner` ON `referral_commissions` (`owner`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_commissions_payment` ON `referral_commissions` (`account`,`payment_intent`);--> statement-breakpoint
CREATE TABLE `referral_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product_id` text NOT NULL,
	`email` text NOT NULL,
	`percent` integer NOT NULL,
	`code` text NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `referral_invites_code_unique` ON `referral_invites` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `referral_invites_token_hash_unique` ON `referral_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_referrals_owner` ON `referral_invites` (`owner`);--> statement-breakpoint
CREATE INDEX `idx_referrals_user` ON `referral_invites` (`user_id`);--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`object_key` text NOT NULL,
	`status` text DEFAULT 'uploading' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_uploads_owner` ON `uploads` (`owner`);--> statement-breakpoint
CREATE INDEX `idx_uploads_product` ON `uploads` (`product_id`);--> statement-breakpoint
ALTER TABLE `checkout_intents` ADD `referral_id` text;--> statement-breakpoint
ALTER TABLE `checkout_intents` ADD `referral_fee` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `checkout_intents` ADD `email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `experience` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `providers` ADD `resend` text;