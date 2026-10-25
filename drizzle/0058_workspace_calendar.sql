CREATE TABLE calendar_accounts (
 id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, name TEXT NOT NULL, platform TEXT NOT NULL,
 handle TEXT NOT NULL DEFAULT '', color TEXT NOT NULL, timezone TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
 request_hash TEXT NOT NULL, updated_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX calendar_accounts_owner ON calendar_accounts(owner,archived,name);
CREATE TABLE calendar_events (
 id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, title TEXT NOT NULL, start_at INTEGER NOT NULL, end_at INTEGER NOT NULL,
 timezone TEXT NOT NULL, all_day INTEGER NOT NULL DEFAULT 0,
 account_id TEXT REFERENCES calendar_accounts(id), product_id TEXT REFERENCES products(id) ON DELETE SET NULL,
 kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'planned', notes TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'manual',
 source_id TEXT, funnel_node_id TEXT, funnel_idea_id TEXT, request_hash TEXT NOT NULL, updated_at INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX calendar_events_owner_time ON calendar_events(owner,start_at,end_at);
CREATE INDEX calendar_events_account_time ON calendar_events(account_id,start_at);
