-- Additive, opt-in selling slice. No legacy record is converted or removed.
ALTER TABLE uploads ADD COLUMN sha256 TEXT;
--> statement-breakpoint
ALTER TABLE uploads ADD COLUMN validation_error TEXT;
--> statement-breakpoint
ALTER TABLE uploads ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE checkout_intents ADD COLUMN sale_revision_id TEXT;
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN sale_revision_id TEXT;
--> statement-breakpoint
CREATE TABLE file_sale_drafts (
  product_id TEXT PRIMARY KEY NOT NULL REFERENCES products(id),
  version INTEGER NOT NULL DEFAULT 1,
  data TEXT NOT NULL,
  published_revision_id TEXT
);
--> statement-breakpoint
CREATE TABLE file_sale_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(id),
  version INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(product_id,version)
);
--> statement-breakpoint
CREATE TABLE file_sale_grants (
  order_id TEXT NOT NULL REFERENCES orders(id),
  revision_id TEXT NOT NULL REFERENCES file_sale_revisions(id),
  module TEXT NOT NULL CHECK(module IN ('downloads','course')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(order_id,module,revision_id)
);
--> statement-breakpoint
CREATE TABLE file_sale_events (
  id TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  event TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_file_sale_orders ON orders(product_id,sale_revision_id);
--> statement-breakpoint
CREATE INDEX idx_file_sale_events ON file_sale_events(product_id,created_at);
