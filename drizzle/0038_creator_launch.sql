CREATE TABLE creator_launch_journeys (
 product_id TEXT PRIMARY KEY NOT NULL REFERENCES products(id),
 owner TEXT NOT NULL,
 feedback TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(feedback) AND length(feedback)<=40000),
 shared_at INTEGER,
 shared_publication_version INTEGER,
 shared_channel TEXT NOT NULL DEFAULT '',
 updated_at INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX creator_launch_owner ON creator_launch_journeys(owner,product_id);
