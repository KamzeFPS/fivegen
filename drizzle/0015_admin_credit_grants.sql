CREATE TABLE `credit_admin_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`email` text NOT NULL,
	`credits` integer NOT NULL,
	`admin` text NOT NULL,
	`applied` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_credit_admin_grants_owner` ON `credit_admin_grants` (`owner`,`created_at`);
