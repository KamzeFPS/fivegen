CREATE TABLE service_connections (
 owner TEXT NOT NULL, provider TEXT NOT NULL, credentials TEXT NOT NULL, expires_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'connected', refresh_lease INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL,
 PRIMARY KEY(owner,provider)
);
--> statement-breakpoint
CREATE TABLE service_oauth_states (
 state_hash TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, provider TEXT NOT NULL, browser_hash TEXT NOT NULL,
 verifier TEXT NOT NULL, return_to TEXT NOT NULL, expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX service_oauth_owner ON service_oauth_states(owner,provider,expires_at);
--> statement-breakpoint
CREATE TABLE service_sync_jobs (
 id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL REFERENCES product_service_sessions(id), owner TEXT NOT NULL, mode TEXT NOT NULL, provider TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
 due_at INTEGER NOT NULL, lease INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '', remote_id TEXT NOT NULL DEFAULT '',
 meeting_url TEXT NOT NULL DEFAULT '', create_started_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL,
 UNIQUE(session_id,provider)
);
--> statement-breakpoint
CREATE INDEX service_sync_due ON service_sync_jobs(status,due_at,lease);
