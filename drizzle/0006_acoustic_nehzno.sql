CREATE TABLE `ai_product_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`product_id` text NOT NULL,
	`period` text NOT NULL,
	`mode` text NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_runs_month` ON `ai_product_runs` (`owner`,`period`);--> statement-breakpoint
CREATE TABLE `terms_acceptances` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`version` text NOT NULL,
	`email` text NOT NULL,
	`accepted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_terms_owner_version` ON `terms_acceptances` (`owner`,`version`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_wallets` (
	`owner` text PRIMARY KEY NOT NULL,
	`starter` integer DEFAULT 0 NOT NULL,
	`included` integer DEFAULT 0 NOT NULL,
	`purchased` integer DEFAULT 0 NOT NULL,
	`cycle` text DEFAULT '' NOT NULL,
	`expires` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_wallets`("owner", "starter", "included", "purchased", "cycle", "expires") SELECT "owner", "starter", "included", "purchased", "cycle", "expires" FROM `wallets`;--> statement-breakpoint
DROP TABLE `wallets`;--> statement-breakpoint
ALTER TABLE `__new_wallets` RENAME TO `wallets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `generation` ADD `run_id` text;
--> statement-breakpoint
-- Preserve unspent valid paid-plan credits; retire promotional starter grants.
UPDATE wallets SET purchased=purchased+CASE WHEN expires>CAST(strftime('%s','now') AS INTEGER)*1000 THEN max(0,included) ELSE 0 END,starter=0,included=0,expires=0;
