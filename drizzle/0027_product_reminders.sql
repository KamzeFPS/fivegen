CREATE TABLE product_notification_preferences (
 order_id TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, timezone_offset INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
);
CREATE TABLE product_reminder_jobs (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL, product_id TEXT NOT NULL, owner TEXT NOT NULL, mode TEXT NOT NULL, recipient TEXT NOT NULL,
 kind TEXT NOT NULL, reference_id TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL, body TEXT NOT NULL, due_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', lease INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, first_attempt_at INTEGER,
 payload TEXT NOT NULL DEFAULT '', sent_at INTEGER, provider_id TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
);
CREATE INDEX product_reminder_due ON product_reminder_jobs(mode,status,due_at);
