CREATE TABLE creator_context_profiles (
 owner TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, approved INTEGER NOT NULL DEFAULT 0,
 data TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL
);
CREATE TABLE creator_product_context (
 product_id TEXT PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE, owner TEXT NOT NULL,
 use_profile INTEGER NOT NULL DEFAULT 0, source_ids TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL
);
CREATE INDEX creator_product_context_owner ON creator_product_context(owner,product_id);
CREATE TABLE creator_context_proposals (
 owner TEXT NOT NULL, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 message_id TEXT NOT NULL, refs TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(owner,product_id,message_id)
);
