CREATE TABLE public_page_records (
 id TEXT PRIMARY KEY NOT NULL, product_id TEXT NOT NULL, owner TEXT NOT NULL,
 name TEXT NOT NULL, purpose TEXT NOT NULL CHECK(purpose IN ('sales','lead','application')),
 draft TEXT NOT NULL, published TEXT, public_product TEXT, published_at INTEGER,
 updated_at INTEGER NOT NULL, legacy_source_version INTEGER,
 UNIQUE(product_id, legacy_source_version)
);
--> statement-breakpoint
CREATE INDEX public_page_records_owner ON public_page_records(owner,product_id);
--> statement-breakpoint
CREATE TABLE public_page_revisions (id TEXT PRIMARY KEY NOT NULL,page_id TEXT NOT NULL,product_id TEXT NOT NULL,owner TEXT NOT NULL,config TEXT NOT NULL,created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX public_page_revisions_page ON public_page_revisions(page_id,owner,created_at);
--> statement-breakpoint
CREATE TABLE public_page_form_receipts (id TEXT PRIMARY KEY NOT NULL,page_id TEXT NOT NULL,page_version INTEGER NOT NULL,section_id TEXT NOT NULL,lead_id TEXT NOT NULL,owner TEXT NOT NULL,product_id TEXT NOT NULL,source TEXT NOT NULL,marketing INTEGER NOT NULL,consent_text TEXT NOT NULL,consent_at INTEGER,created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX public_page_receipts_product ON public_page_form_receipts(product_id,owner,created_at);
