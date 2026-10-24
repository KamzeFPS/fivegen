CREATE TABLE product_custom_fulfillment (
 order_id TEXT PRIMARY KEY REFERENCES commerce_orders(id), product_id TEXT NOT NULL, owner TEXT NOT NULL, mode TEXT NOT NULL,
 address TEXT NOT NULL DEFAULT '{}', address_source TEXT NOT NULL DEFAULT 'customer', status TEXT NOT NULL DEFAULT 'pending',
 tracking_url TEXT NOT NULL DEFAULT '', carrier TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL
);
CREATE INDEX product_fulfillment_owner ON product_custom_fulfillment(owner,product_id,mode,status);
CREATE TABLE product_purchase_updates (
 order_id TEXT NOT NULL REFERENCES commerce_orders(id), previous_version INTEGER NOT NULL, version INTEGER NOT NULL,
 previous_snapshot TEXT NOT NULL, adopted_at INTEGER NOT NULL, PRIMARY KEY(order_id,version)
);
