-- Product-scoped collaborator invitations and draft-only change history.
-- This never changes product ownership, buyer entitlements or financial roles.
CREATE TABLE creator_collaborators (
 id TEXT PRIMARY KEY NOT NULL,
 product_id TEXT NOT NULL REFERENCES products(id),
 owner TEXT NOT NULL,
 email TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('editor','marketer','support')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','revoked')),
 token_hash TEXT NOT NULL UNIQUE,
 expires_at INTEGER NOT NULL,
 accepted_user_id TEXT,
 accepted_at INTEGER,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX creator_collaborator_product ON creator_collaborators(owner,product_id,status);
--> statement-breakpoint
CREATE INDEX creator_collaborator_recipient ON creator_collaborators(accepted_user_id,status);
--> statement-breakpoint
CREATE TABLE creator_collaboration_events (
 id TEXT PRIMARY KEY NOT NULL,
 collaborator_id TEXT NOT NULL REFERENCES creator_collaborators(id),
 product_id TEXT NOT NULL REFERENCES products(id),
 owner TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 actor_email TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('invitation','role','revocation','acceptance','content','page','growth','campaign','note')),
 status TEXT NOT NULL CHECK(status IN ('recorded','pending','saved','failed')),
 source_revision INTEGER,
 note TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 reviewed_at INTEGER
);
--> statement-breakpoint
CREATE INDEX creator_collaboration_event_scope ON creator_collaboration_events(owner,product_id,created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX creator_collaborator_one_open_invitation ON creator_collaborators(owner,product_id,email) WHERE status!='revoked';
