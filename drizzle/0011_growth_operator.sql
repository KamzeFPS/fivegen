CREATE TABLE `growth_generation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product_id` text NOT NULL,
	`expected_updated_at` integer NOT NULL,
	`state` text NOT NULL,
	`response` text,
	`cost` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_growth_runs_owner` ON `growth_generation_runs` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `growth_workspaces` (
	`product_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`brief` text NOT NULL,
	`assets` text,
	`lease` integer DEFAULT 0 NOT NULL,
	`lease_id` text,
	`updated_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_growth_workspaces_owner` ON `growth_workspaces` (`owner`);--> statement-breakpoint
CREATE TABLE `growth_funnels` (
	`product_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`landing` text NOT NULL,
	`creator_vsl_upload_id` text,
	`published_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `growth_funnels_slug_unique` ON `growth_funnels` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_growth_funnels_owner` ON `growth_funnels` (`owner`);--> statement-breakpoint
CREATE TABLE `growth_lead_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`hits` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_growth_lead_rate_expiry` ON `growth_lead_rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `growth_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`marketing` integer DEFAULT 0 NOT NULL,
	`consent_text` text DEFAULT '' NOT NULL,
	`consent_at` integer,
	`source` text NOT NULL,
	`last_source` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_growth_leads_product_email` ON `growth_leads` (`product_id`,`email`);--> statement-breakpoint
CREATE INDEX `idx_growth_leads_owner_date` ON `growth_leads` (`owner`,`created_at`);