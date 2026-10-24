CREATE TABLE product_editorial_reviews (
 product_id TEXT NOT NULL REFERENCES products(id), owner TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('test','live')), version INTEGER NOT NULL,
 fingerprint TEXT NOT NULL, engine_version INTEGER NOT NULL,
 records TEXT NOT NULL DEFAULT '{}', approved_at INTEGER,
 final_note TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL,
 PRIMARY KEY(product_id,owner,mode,version,fingerprint)
);
