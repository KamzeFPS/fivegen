CREATE TABLE growth_plan_reviews (
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 owner TEXT NOT NULL,
 asset_key TEXT NOT NULL,
 source_revision INTEGER NOT NULL,
 context_fingerprint TEXT NOT NULL,
 reviewed_at INTEGER NOT NULL,
 PRIMARY KEY(product_id,asset_key)
);
--> statement-breakpoint
CREATE TABLE growth_asset_proposals (
 id TEXT PRIMARY KEY NOT NULL,
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 owner TEXT NOT NULL,
 asset TEXT NOT NULL CHECK(asset IN ('vsl','landing','followUp')),
 expected_updated_at INTEGER NOT NULL,
 base_value TEXT NOT NULL,
 proposal TEXT NOT NULL,
 context_refs TEXT NOT NULL,
 product_facts TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 applied_at INTEGER
);
--> statement-breakpoint
CREATE INDEX growth_asset_proposals_owner ON growth_asset_proposals(owner,product_id,created_at);
--> statement-breakpoint
ALTER TABLE growth_generation_runs ADD COLUMN scope TEXT NOT NULL DEFAULT 'legacy-all';
--> statement-breakpoint
ALTER TABLE connected_marketing_launches ADD COLUMN page_id TEXT;
--> statement-breakpoint
ALTER TABLE connected_marketing_launches ADD COLUMN campaign_id TEXT;
--> statement-breakpoint
ALTER TABLE connected_marketing_launches ADD COLUMN include_email INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE connected_marketing_launches ADD COLUMN include_script INTEGER NOT NULL DEFAULT 0;
