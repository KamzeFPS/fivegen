CREATE TABLE product_enrollments (
 order_id TEXT PRIMARY KEY REFERENCES commerce_orders(id), product_id TEXT NOT NULL, owner TEXT NOT NULL, mode TEXT NOT NULL,
 email TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT '', cohort TEXT NOT NULL DEFAULT '',
 role TEXT NOT NULL DEFAULT 'member', rules_accepted_at INTEGER, muted_until INTEGER NOT NULL DEFAULT 0, removed INTEGER NOT NULL DEFAULT 0,
 started_at INTEGER NOT NULL, completed_at INTEGER, updated_at INTEGER NOT NULL
);
CREATE INDEX product_enrollment_owner ON product_enrollments(owner,product_id,mode,updated_at);
CREATE TABLE product_learning_progress (
 order_id TEXT NOT NULL REFERENCES commerce_orders(id), section_id TEXT NOT NULL, completed_at INTEGER, position_seconds REAL NOT NULL DEFAULT 0,
 quiz_answers TEXT NOT NULL DEFAULT '[]', quiz_passed INTEGER NOT NULL DEFAULT 0, assignment TEXT NOT NULL DEFAULT '', proof TEXT NOT NULL DEFAULT '',
 file_ids TEXT NOT NULL DEFAULT '[]', review_status TEXT NOT NULL DEFAULT 'none', review_feedback TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL,
 PRIMARY KEY(order_id,section_id)
);
CREATE TABLE product_learning_comments (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL, owner TEXT NOT NULL, mode TEXT NOT NULL, order_id TEXT NOT NULL,
 section_id TEXT NOT NULL, name TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX product_learning_comment_scope ON product_learning_comments(product_id,mode,section_id,created_at);
CREATE TABLE product_challenge_checkins (
 order_id TEXT NOT NULL, day TEXT NOT NULL, section_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(order_id,day,section_id)
);
CREATE TABLE product_student_files (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL, product_id TEXT NOT NULL, owner TEXT NOT NULL, name TEXT NOT NULL,
 mime TEXT NOT NULL, size INTEGER NOT NULL, object_key TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX product_student_file_order ON product_student_files(order_id,created_at);
CREATE TABLE product_community_posts (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL, owner TEXT NOT NULL, mode TEXT NOT NULL, order_id TEXT,
 channel TEXT NOT NULL, parent_id TEXT, name TEXT NOT NULL, body TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0,
 hidden INTEGER NOT NULL DEFAULT 0, poll TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL
);
CREATE INDEX product_community_post_scope ON product_community_posts(product_id,mode,channel,created_at);
CREATE TABLE product_community_reactions (
 post_id TEXT NOT NULL, order_id TEXT NOT NULL, reaction TEXT NOT NULL, PRIMARY KEY(post_id,order_id,reaction)
);
CREATE TABLE product_community_votes (
 post_id TEXT NOT NULL, order_id TEXT NOT NULL, option_index INTEGER NOT NULL, PRIMARY KEY(post_id,order_id)
);
CREATE TABLE product_community_reports (
 id TEXT PRIMARY KEY, product_id TEXT NOT NULL, owner TEXT NOT NULL, mode TEXT NOT NULL, order_id TEXT NOT NULL,
 post_id TEXT NOT NULL, reason TEXT NOT NULL, resolved INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE TABLE product_service_sessions (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES commerce_orders(id), product_id TEXT NOT NULL, owner TEXT NOT NULL, mode TEXT NOT NULL,
 slot_id TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed',
 intake TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', action_items TEXT NOT NULL DEFAULT '[]', resources TEXT NOT NULL DEFAULT '[]',
 recording_url TEXT NOT NULL DEFAULT '', meeting_url TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX product_service_session_slot ON product_service_sessions(slot_id,mode) WHERE status='confirmed';
CREATE INDEX product_service_session_order ON product_service_sessions(order_id,status);
CREATE INDEX product_service_session_owner ON product_service_sessions(owner,mode,starts_at);
CREATE TABLE product_service_messages (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL, product_id TEXT NOT NULL, owner TEXT NOT NULL, sender TEXT NOT NULL,
 body TEXT NOT NULL, file_ids TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL
);
CREATE INDEX product_service_message_order ON product_service_messages(order_id,created_at);
CREATE TABLE product_service_agreements (
 order_id TEXT PRIMARY KEY, agreement TEXT NOT NULL, accepted_at INTEGER NOT NULL
);
