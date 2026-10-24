CREATE TABLE marketing_campaigns (
 id TEXT PRIMARY KEY NOT NULL,
 product_id TEXT NOT NULL REFERENCES products(id), owner TEXT NOT NULL,
 title TEXT NOT NULL, goal TEXT NOT NULL DEFAULT '', source_ids TEXT NOT NULL DEFAULT '[]',
 items TEXT NOT NULL DEFAULT '[]', source_revisions TEXT NOT NULL DEFAULT '[]',
 context_refs TEXT, brief_revision INTEGER NOT NULL DEFAULT 0,
 destination TEXT, lease INTEGER NOT NULL DEFAULT 0, lease_id TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
--> statement-breakpoint
INSERT INTO marketing_campaigns(id,product_id,owner,title,goal,source_ids,items,source_revisions,context_refs,brief_revision,lease,lease_id,created_at,updated_at)
 SELECT product_id,product_id,owner,title,goal,source_ids,items,source_revisions,context_refs,brief_revision,lease,lease_id,updated_at,updated_at FROM creator_campaigns;
--> statement-breakpoint
CREATE INDEX marketing_campaign_scope ON marketing_campaigns(owner,product_id,updated_at);
--> statement-breakpoint
CREATE TABLE marketing_campaign_selection(product_id TEXT PRIMARY KEY NOT NULL REFERENCES products(id),owner TEXT NOT NULL,campaign_id TEXT NOT NULL REFERENCES marketing_campaigns(id),updated_at INTEGER NOT NULL);
--> statement-breakpoint
INSERT INTO marketing_campaign_selection(product_id,owner,campaign_id,updated_at) SELECT product_id,owner,id,updated_at FROM marketing_campaigns;
--> statement-breakpoint
CREATE TABLE campaign_versions(id TEXT PRIMARY KEY NOT NULL,owner TEXT NOT NULL,product_id TEXT NOT NULL,campaign_id TEXT NOT NULL REFERENCES marketing_campaigns(id),snapshot TEXT NOT NULL,label TEXT NOT NULL,created_at INTEGER NOT NULL,source_revision INTEGER NOT NULL,UNIQUE(owner,campaign_id,source_revision));
--> statement-breakpoint
INSERT INTO campaign_versions(id,owner,product_id,campaign_id,snapshot,label,created_at,source_revision) SELECT id,owner,product_id,product_id,snapshot,label,created_at,source_revision FROM marketing_draft_versions WHERE kind='campaign';
--> statement-breakpoint
ALTER TABLE campaign_email_imports ADD COLUMN campaign_id TEXT;
--> statement-breakpoint
UPDATE campaign_email_imports SET campaign_id=product_id;
--> statement-breakpoint
CREATE TABLE campaign_email_links(id TEXT PRIMARY KEY NOT NULL,owner TEXT NOT NULL,product_id TEXT NOT NULL,campaign_id TEXT NOT NULL REFERENCES marketing_campaigns(id),item_id TEXT NOT NULL,sequence_id TEXT NOT NULL,step_id TEXT NOT NULL,campaign_revision INTEGER NOT NULL,sequence_revision INTEGER NOT NULL,content_hash TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(owner,campaign_id,item_id));
--> statement-breakpoint
CREATE INDEX campaign_email_link_sequence ON campaign_email_links(owner,product_id,sequence_id);
--> statement-breakpoint
ALTER TABLE product_share_links ADD COLUMN destination_page_id TEXT;
--> statement-breakpoint
ALTER TABLE product_share_links ADD COLUMN destination_version INTEGER;
--> statement-breakpoint
ALTER TABLE product_share_links ADD COLUMN destination_path TEXT;
--> statement-breakpoint
CREATE TABLE creator_reply_templates(product_id TEXT PRIMARY KEY NOT NULL REFERENCES products(id),owner TEXT NOT NULL,subject TEXT NOT NULL DEFAULT '',body TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL,updated_at INTEGER NOT NULL);
