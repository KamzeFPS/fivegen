CREATE TABLE product_push_settings (
 id TEXT PRIMARY KEY NOT NULL, public_key TEXT NOT NULL, credentials TEXT NOT NULL, created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE product_push_subscriptions (
 id TEXT PRIMARY KEY NOT NULL, order_id TEXT NOT NULL REFERENCES commerce_orders(id), owner TEXT NOT NULL, mode TEXT NOT NULL,
 endpoint_hash TEXT NOT NULL, subscription TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
 UNIQUE(order_id,endpoint_hash)
);
--> statement-breakpoint
CREATE INDEX product_push_order ON product_push_subscriptions(order_id,enabled);
--> statement-breakpoint
CREATE TABLE product_push_jobs (
 id TEXT PRIMARY KEY NOT NULL, reminder_id TEXT NOT NULL REFERENCES product_reminder_jobs(id), subscription_id TEXT NOT NULL REFERENCES product_push_subscriptions(id),
 order_id TEXT NOT NULL REFERENCES commerce_orders(id), status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
 due_at INTEGER NOT NULL, lease INTEGER NOT NULL DEFAULT 0, sent_at INTEGER, error TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX product_push_due ON product_push_jobs(status,due_at,lease);
