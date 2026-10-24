CREATE TABLE service_applications (
 id TEXT PRIMARY KEY NOT NULL,
 owner TEXT NOT NULL,
 product_id TEXT NOT NULL,
 page_id TEXT NOT NULL,
 section_id TEXT NOT NULL,
 page_version INTEGER NOT NULL,
 name TEXT NOT NULL,
 email TEXT NOT NULL,
 submission_hash TEXT NOT NULL,
 answers TEXT NOT NULL,
 form_snapshot TEXT NOT NULL,
 review_consent TEXT NOT NULL,
 consent_at INTEGER NOT NULL,
 marketing INTEGER NOT NULL DEFAULT 0,
 marketing_consent TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'new',
 private_notes TEXT NOT NULL DEFAULT '',
 booking_url TEXT NOT NULL DEFAULT '',
 handoff_message TEXT NOT NULL DEFAULT '',
 handoff_prepared_at INTEGER,
 revision INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX service_application_owner_product ON service_applications(owner,product_id,created_at);
CREATE INDEX service_application_person ON service_applications(owner,email,product_id);
CREATE TABLE service_application_reviews (
 id TEXT PRIMARY KEY NOT NULL,
 application_id TEXT NOT NULL,
 owner TEXT NOT NULL,
 actor TEXT NOT NULL,
 status TEXT NOT NULL,
 revision INTEGER NOT NULL,
 action TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 UNIQUE(application_id,revision)
);
CREATE TABLE service_application_limits (
 key TEXT PRIMARY KEY NOT NULL,
 hits INTEGER NOT NULL,
 expires_at INTEGER NOT NULL
);
