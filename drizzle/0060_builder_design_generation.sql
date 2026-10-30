-- Design generation produces a private proposal. It never writes a builder
-- draft, revision, publication or product content.
CREATE TABLE builder_design_generation_runs (
 id TEXT PRIMARY KEY NOT NULL,
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 owner TEXT NOT NULL,
 expected_version INTEGER NOT NULL,
 product_updated_at INTEGER NOT NULL,
 draft_snapshot TEXT NOT NULL,
 request_intent TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','completed','failed')),
 cost INTEGER NOT NULL CHECK(cost >= 0),
 response TEXT,
 lease_expires_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX idx_builder_design_generation_owner ON builder_design_generation_runs(product_id,owner,state,lease_expires_at);
CREATE UNIQUE INDEX idx_builder_design_generation_pending ON builder_design_generation_runs(product_id,owner) WHERE state='pending';
