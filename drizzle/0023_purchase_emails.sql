-- Transactional confirmations only. Existing purchases are never backfilled.
CREATE TABLE purchase_emails (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('commerce','legacy')),
  order_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  product_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('live','test')),
  recipient TEXT NOT NULL,
  title TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  access_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','cancelled','suppressed')),
  payload TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at INTEGER,
  lease INTEGER NOT NULL DEFAULT 0,
  due_at INTEGER NOT NULL,
  sent_at INTEGER,
  provider_id TEXT,
  error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE(source,mode,order_id)
);
--> statement-breakpoint
CREATE INDEX idx_purchase_email_dispatch ON purchase_emails(status,due_at,lease);
--> statement-breakpoint
CREATE INDEX idx_purchase_email_owner ON purchase_emails(owner,created_at);
