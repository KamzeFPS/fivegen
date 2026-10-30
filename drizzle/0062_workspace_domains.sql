CREATE TABLE workspace_domain_bases (
 base_domain TEXT PRIMARY KEY NOT NULL,
 first_seen_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE workspace_domains (
 owner TEXT PRIMARY KEY NOT NULL,
 base_domain TEXT NOT NULL,
 subdomain TEXT,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 operation_token TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 UNIQUE(base_domain,subdomain)
);
--> statement-breakpoint
CREATE TABLE workspace_product_paths (
 owner TEXT NOT NULL,
 product_id TEXT NOT NULL,
 path TEXT NOT NULL,
 PRIMARY KEY(owner,product_id),
 UNIQUE(owner,path)
);
