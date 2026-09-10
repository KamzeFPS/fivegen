CREATE TABLE `mcp_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`connection_id` text NOT NULL,
	`tool` text NOT NULL,
	`fingerprint` text NOT NULL,
	`state` text NOT NULL,
	`result` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_mcp_calls_owner` ON `mcp_calls` (`owner`,`created_at`);--> statement-breakpoint
CREATE TABLE `mcp_clients` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`redirects` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mcp_codes` (
	`hash` text PRIMARY KEY NOT NULL,
	`client_id` text NOT NULL,
	`owner` text NOT NULL,
	`redirect` text NOT NULL,
	`challenge` text NOT NULL,
	`scopes` text NOT NULL,
	`resource` text NOT NULL,
	`expires` integer NOT NULL,
	`used` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mcp_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`client_id` text NOT NULL,
	`name` text NOT NULL,
	`scopes` text NOT NULL,
	`resource` text NOT NULL,
	`access_hash` text NOT NULL,
	`refresh_hash` text NOT NULL,
	`access_expires` integer NOT NULL,
	`refresh_expires` integer NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`last_used_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_connections_access_hash_unique` ON `mcp_connections` (`access_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `mcp_connections_refresh_hash_unique` ON `mcp_connections` (`refresh_hash`);--> statement-breakpoint
CREATE INDEX `idx_mcp_connections_owner` ON `mcp_connections` (`owner`);