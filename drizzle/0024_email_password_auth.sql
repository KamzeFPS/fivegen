-- Add email credentials without changing existing Google IDs or paid records.
CREATE TABLE IF NOT EXISTS render_sessions (
  hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, email TEXT NOT NULL,
  name TEXT NOT NULL, expires INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE render_google_identities (
  user_id TEXT PRIMARY KEY NOT NULL,
  subject TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO render_google_identities (user_id,subject,email,name,updated_at)
  SELECT user_id,substr(user_id,8),lower(email),name,MAX(expires)
  FROM render_sessions WHERE user_id LIKE 'google:%' GROUP BY user_id;
--> statement-breakpoint
CREATE INDEX render_google_identity_email ON render_google_identities(email);
--> statement-breakpoint
CREATE TABLE render_email_accounts (
  email TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  verified_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE render_email_tokens (
  hash TEXT PRIMARY KEY NOT NULL,
  purpose TEXT NOT NULL CHECK(purpose IN ('verify','reset')),
  user_id TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  used_at INTEGER
);
--> statement-breakpoint
CREATE INDEX render_email_token_user ON render_email_tokens(user_id,purpose,expires);
--> statement-breakpoint
CREATE TABLE render_email_auth_limits (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL,
  starts_at INTEGER NOT NULL
);
