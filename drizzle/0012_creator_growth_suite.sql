CREATE TABLE `growth_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product_id` text NOT NULL,
	`visitor` text NOT NULL,
	`event` text NOT NULL,
	`campaign` text DEFAULT 'direct' NOT NULL,
	`day` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_growth_event_once` ON `growth_events` (`product_id`,`visitor`,`event`,`day`);--> statement-breakpoint
CREATE INDEX `idx_growth_events_owner_time` ON `growth_events` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `offer_experiments` (
	`product_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`slug` text NOT NULL,
	`draft` text NOT NULL,
	`published` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`revision` integer NOT NULL,
	`published_revision` integer,
	`published_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `offer_experiments_slug_unique` ON `offer_experiments` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_offer_experiments_owner` ON `offer_experiments` (`owner`);--> statement-breakpoint
CREATE TABLE `offer_responses` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`owner` text NOT NULL,
	`revision` integer NOT NULL,
	`visitor` text NOT NULL,
	`preference` text NOT NULL,
	`readiness` text NOT NULL,
	`feedback` text NOT NULL,
	`email` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_offer_response_visitor` ON `offer_responses` (`product_id`,`revision`,`visitor`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_offer_response_email` ON `offer_responses` (`product_id`,`revision`,`email`);--> statement-breakpoint
CREATE INDEX `idx_offer_responses_owner` ON `offer_responses` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `offer_visitors` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`owner` text NOT NULL,
	`revision` integer NOT NULL,
	`visitor` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_offer_visitors_once` ON `offer_visitors` (`product_id`,`revision`,`visitor`);--> statement-breakpoint
CREATE TABLE `commerce_accounts` (
	`key` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`mode` text NOT NULL,
	`account_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_account_identity` ON `commerce_accounts` (`mode`,`account_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_account_owner` ON `commerce_accounts` (`owner`,`mode`);--> statement-breakpoint
CREATE TABLE `commerce_bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`slot_id` text NOT NULL,
	`order_id` text NOT NULL,
	`owner` text NOT NULL,
	`product_id` text NOT NULL,
	`email` text NOT NULL,
	`mode` text NOT NULL,
	`intake` text NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_booking_slot` ON `commerce_bookings` (`slot_id`,`mode`) WHERE "commerce_bookings"."status" = 'confirmed';--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_booking_order` ON `commerce_bookings` (`order_id`) WHERE "commerce_bookings"."status" = 'confirmed';--> statement-breakpoint
CREATE INDEX `commerce_booking_owner` ON `commerce_bookings` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `commerce_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `commerce_offers` (
	`product_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'usd' NOT NULL,
	`intake_prompt` text DEFAULT '' NOT NULL,
	`meeting_url` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `commerce_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product_id` text NOT NULL,
	`account_id` text NOT NULL,
	`mode` text NOT NULL,
	`email` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`title` text NOT NULL,
	`campaign` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`session_id` text,
	`payment_intent` text,
	`access_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`paid_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_orders_session_id_unique` ON `commerce_orders` (`session_id`);--> statement-breakpoint
CREATE INDEX `commerce_order_email` ON `commerce_orders` (`email`,`mode`);--> statement-breakpoint
CREATE INDEX `commerce_order_owner` ON `commerce_orders` (`owner`,`mode`,`paid_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_payment` ON `commerce_orders` (`account_id`,`mode`,`payment_intent`);--> statement-breakpoint
CREATE TABLE `commerce_revocations` (
	`key` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`mode` text NOT NULL,
	`payment_intent` text NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `commerce_slots` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product_id` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_slot_time` ON `commerce_slots` (`owner`,`starts_at`);--> statement-breakpoint
CREATE INDEX `commerce_slot_product` ON `commerce_slots` (`product_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `automation_enrollments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product_id` text NOT NULL,
	`sequence_id` text NOT NULL,
	`event_id` text NOT NULL,
	`email` text NOT NULL,
	`lead_id` text,
	`order_id` text,
	`revision` integer NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_automation_enrollment_event` ON `automation_enrollments` (`sequence_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `idx_automation_enrollment_owner_email` ON `automation_enrollments` (`owner`,`email`);--> statement-breakpoint
CREATE TABLE `automation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`enrollment_id` text NOT NULL,
	`owner` text NOT NULL,
	`product_id` text NOT NULL,
	`step_index` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`due_at` integer NOT NULL,
	`lease` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`first_attempt_at` integer,
	`sent_at` integer,
	`provider_id` text,
	`error` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_automation_job_step` ON `automation_jobs` (`enrollment_id`,`step_index`);--> statement-breakpoint
CREATE INDEX `idx_automation_job_due` ON `automation_jobs` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `idx_automation_job_owner` ON `automation_jobs` (`owner`,`product_id`);--> statement-breakpoint
CREATE TABLE `automation_sequences` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product_id` text NOT NULL,
	`trigger` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`draft` text NOT NULL,
	`approved` text,
	`revision` integer NOT NULL,
	`approved_revision` integer,
	`activated_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_automation_sequence_product_trigger` ON `automation_sequences` (`product_id`,`trigger`);--> statement-breakpoint
CREATE INDEX `idx_automation_sequence_owner` ON `automation_sequences` (`owner`);--> statement-breakpoint
CREATE TABLE `automation_suppressions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_automation_suppression_owner_email` ON `automation_suppressions` (`owner`,`email`);--> statement-breakpoint
CREATE TABLE `automation_unsubscribe_tokens` (
	`hash` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`email` text NOT NULL,
	`enrollment_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_automation_unsubscribe_enrollment` ON `automation_unsubscribe_tokens` (`enrollment_id`);--> statement-breakpoint
CREATE TABLE `creator_ai_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`kind` text NOT NULL,
	`target_id` text NOT NULL,
	`expected_updated_at` integer NOT NULL,
	`state` text NOT NULL,
	`response` text,
	`cost` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_creator_runs_owner` ON `creator_ai_runs` (`owner`,`kind`,`target_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `creator_campaigns` (
	`product_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`title` text NOT NULL,
	`goal` text DEFAULT '' NOT NULL,
	`source_ids` text DEFAULT '[]' NOT NULL,
	`items` text DEFAULT '[]' NOT NULL,
	`source_revisions` text DEFAULT '[]' NOT NULL,
	`lease` integer DEFAULT 0 NOT NULL,
	`lease_id` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_campaign_owner` ON `creator_campaigns` (`owner`,`updated_at`);--> statement-breakpoint
CREATE TABLE `creator_voice_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product_id` text NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`transcript` text DEFAULT '' NOT NULL,
	`evidence` text DEFAULT '' NOT NULL,
	`upload_id` text,
	`permission` integer DEFAULT 0 NOT NULL,
	`approved` integer DEFAULT 0 NOT NULL,
	`lease` integer DEFAULT 0 NOT NULL,
	`lease_id` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_voice_owner` ON `creator_voice_sources` (`owner`,`updated_at`);