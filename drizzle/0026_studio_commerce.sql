CREATE TABLE product_commerce_intents (
 order_id TEXT PRIMARY KEY NOT NULL REFERENCES commerce_orders(id),
 pricing_model TEXT NOT NULL, subscription_id TEXT, status TEXT NOT NULL DEFAULT 'pending',
 period_start INTEGER, period_end INTEGER, spec TEXT NOT NULL, updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX product_subscription_identity ON product_commerce_intents(subscription_id) WHERE subscription_id IS NOT NULL;
--> statement-breakpoint
CREATE TABLE product_bundle_entitlements (
 parent_order_id TEXT NOT NULL REFERENCES commerce_orders(id), order_id TEXT PRIMARY KEY NOT NULL REFERENCES commerce_orders(id), product_id TEXT NOT NULL,
 UNIQUE(parent_order_id,product_id)
);
--> statement-breakpoint
CREATE TABLE product_subscription_renewals (
 order_id TEXT PRIMARY KEY NOT NULL REFERENCES commerce_orders(id), parent_order_id TEXT NOT NULL REFERENCES commerce_orders(id), invoice_id TEXT NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE INDEX product_bundle_parent ON product_bundle_entitlements(parent_order_id);
