CREATE TABLE `connected_marketing_launches` (
 `product_id` text PRIMARY KEY NOT NULL REFERENCES products(id),
 `owner` text NOT NULL,
 `goal` text NOT NULL,
 `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `marketing_draft_versions` (
 `id` text PRIMARY KEY NOT NULL,
 `owner` text NOT NULL,
 `product_id` text NOT NULL REFERENCES products(id),
 `kind` text NOT NULL,
 `snapshot` text NOT NULL,
 `label` text NOT NULL,
 `created_at` integer NOT NULL,
 `source_revision` integer NOT NULL,
 UNIQUE(owner,product_id,kind,source_revision)
);
--> statement-breakpoint
CREATE INDEX `marketing_draft_versions_scope` ON marketing_draft_versions(owner,product_id,kind,created_at);
--> statement-breakpoint
ALTER TABLE creator_campaigns ADD COLUMN context_refs text;
--> statement-breakpoint
ALTER TABLE growth_workspaces ADD COLUMN context_refs text;
--> statement-breakpoint
CREATE TABLE `campaign_email_imports` (
 `id` text PRIMARY KEY NOT NULL,
 `owner` text NOT NULL,
 `product_id` text NOT NULL REFERENCES products(id),
 `campaign_revision` integer NOT NULL,
 `item_ids` text NOT NULL,
 `sequence_revision` integer NOT NULL,
 `source_refs` text NOT NULL,
 `created_at` integer NOT NULL
);
