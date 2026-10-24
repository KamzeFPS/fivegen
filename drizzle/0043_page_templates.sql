CREATE TABLE IF NOT EXISTS page_brand_presets (
  id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  brand TEXT NOT NULL,
  source_product_id TEXT,
  icon_upload_id TEXT,
  links TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_page_brand_presets_owner ON page_brand_presets(owner, updated_at);
CREATE TABLE IF NOT EXISTS product_page_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  product_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  config TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_product_page_revisions ON product_page_revisions(product_id, owner, created_at);
