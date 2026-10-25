CREATE TABLE funnel_builder_workspaces (
 product_id TEXT PRIMARY KEY NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 owner TEXT NOT NULL,
 brief TEXT NOT NULL,
 graph TEXT NOT NULL,
 strategy TEXT,
 strategy_brief TEXT,
 updated_at INTEGER NOT NULL,
 lease INTEGER NOT NULL DEFAULT 0,
 lease_id TEXT
);
CREATE INDEX idx_funnel_builder_owner ON funnel_builder_workspaces(owner,updated_at);
CREATE TABLE funnel_builder_runs (
 id TEXT PRIMARY KEY NOT NULL,
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 owner TEXT NOT NULL,
 expected_updated_at INTEGER NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','completed','failed')),
 cost INTEGER NOT NULL,
 response TEXT,
 created_at INTEGER NOT NULL
);
CREATE INDEX idx_funnel_builder_pending ON funnel_builder_runs(product_id,owner,state,created_at);
