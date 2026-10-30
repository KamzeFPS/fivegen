CREATE TABLE workspace_attachment_batches (
 id TEXT PRIMARY KEY NOT NULL,
 owner TEXT NOT NULL,
 intent TEXT NOT NULL,
 response TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE workspace_attachments (
 id TEXT PRIMARY KEY NOT NULL,
 owner TEXT NOT NULL,
 batch_id TEXT NOT NULL REFERENCES workspace_attachment_batches(id),
 name TEXT NOT NULL,
 mime TEXT NOT NULL,
 size INTEGER NOT NULL,
 sha256 TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('image','document')),
 object_key TEXT NOT NULL,
 excerpt TEXT NOT NULL,
 warnings TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX idx_workspace_attachments_owner ON workspace_attachments(owner,created_at);
ALTER TABLE studio_plan_turns ADD COLUMN attachment_ids TEXT NOT NULL DEFAULT '[]';
