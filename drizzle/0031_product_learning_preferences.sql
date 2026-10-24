CREATE TABLE product_learning_preferences (
 order_id TEXT PRIMARY KEY REFERENCES commerce_orders(id), display_name TEXT NOT NULL DEFAULT '', share_progress INTEGER NOT NULL DEFAULT 0,
 active_section_id TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL
);
