CREATE TABLE clipper_publishing_settings (
 id TEXT PRIMARY KEY NOT NULL CHECK(id='platform'),
 version INTEGER NOT NULL DEFAULT 1,
 credentials TEXT NOT NULL,
 enabled_platforms TEXT NOT NULL,
 linked_accounts TEXT NOT NULL,
 verified_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 updated_by TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE clipper_publish_jobs (
 id TEXT PRIMARY KEY NOT NULL,
 submission_id TEXT NOT NULL UNIQUE REFERENCES clipper_submissions(id),
 video_id TEXT NOT NULL REFERENCES clipper_videos(id),
 settings_version INTEGER NOT NULL,
 credentials TEXT NOT NULL,
 accounts TEXT NOT NULL,
 caption TEXT NOT NULL,
 platforms TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN('queued','publishing','published','failed','uncertain')),
 results TEXT NOT NULL DEFAULT '[]',
 error TEXT NOT NULL DEFAULT '',
 provider_post_id TEXT NOT NULL DEFAULT '',
 request_key TEXT NOT NULL UNIQUE,
 asset_token_hash TEXT NOT NULL,
 asset_token TEXT NOT NULL,
 asset_expires_at INTEGER NOT NULL,
 create_started_at INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at INTEGER NOT NULL,
 lease INTEGER NOT NULL DEFAULT 0,
 approved_by TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_clipper_publish_due ON clipper_publish_jobs(status,next_attempt_at,lease);
