CREATE TABLE creator_catalogs (
 owner TEXT PRIMARY KEY NOT NULL,
 draft TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL,
 published TEXT,
 published_slug TEXT UNIQUE,
 published_version INTEGER,
 published_at INTEGER
);
--> statement-breakpoint
CREATE TABLE creator_catalog_domains (
 owner TEXT PRIMARY KEY NOT NULL,
 hostname TEXT NOT NULL UNIQUE,
 txt_token TEXT NOT NULL,
 ownership_verified_at INTEGER,
 dns_verified_at INTEGER,
 checked_at INTEGER,
 check_message TEXT NOT NULL DEFAULT '',
 platform_status TEXT NOT NULL DEFAULT 'pending' CHECK(platform_status IN ('pending','connected')),
 tls_status TEXT NOT NULL DEFAULT 'pending' CHECK(tls_status IN ('pending','active')),
 updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX creator_catalog_public ON creator_catalogs(published_slug,published_at);
