CREATE TABLE clipper_campaigns (
 id TEXT PRIMARY KEY NOT NULL,
 version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
 title TEXT NOT NULL, description TEXT NOT NULL, brief TEXT NOT NULL, rules TEXT NOT NULL,
 brand TEXT NOT NULL, category TEXT NOT NULL, platforms TEXT NOT NULL,
 reward_model TEXT NOT NULL CHECK(reward_model IN ('cpm','per_post')),
 currency TEXT NOT NULL CHECK(currency IN ('USD','MNT')),
 rate INTEGER NOT NULL CHECK(rate>0), min_payout INTEGER NOT NULL CHECK(min_payout>=0),
 max_payout INTEGER NOT NULL CHECK(max_payout>=min_payout),
 budget INTEGER NOT NULL CHECK(budget>=max_payout),
 approved_rewards INTEGER NOT NULL DEFAULT 0 CHECK(approved_rewards>=0 AND approved_rewards<=budget),
 starts_at INTEGER, ends_at INTEGER, cover_url TEXT NOT NULL DEFAULT '', reference_url TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','paused','closed')),
 created_by TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE clipper_profiles (
 owner TEXT PRIMARY KEY NOT NULL, display_name TEXT NOT NULL, social_links TEXT NOT NULL,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE clipper_memberships (
 campaign_id TEXT NOT NULL REFERENCES clipper_campaigns(id), owner TEXT NOT NULL REFERENCES clipper_profiles(owner), joined_at INTEGER NOT NULL,
 PRIMARY KEY(campaign_id,owner)
);
--> statement-breakpoint
CREATE INDEX idx_clipper_membership_owner ON clipper_memberships(owner,joined_at);
--> statement-breakpoint
CREATE TABLE clipper_submissions (
 id TEXT PRIMARY KEY NOT NULL, campaign_id TEXT NOT NULL, owner TEXT NOT NULL,
 display_name TEXT NOT NULL, platform TEXT NOT NULL CHECK(platform IN ('tiktok','instagram','youtube')),
 url TEXT NOT NULL UNIQUE, post_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 verified_views INTEGER NOT NULL DEFAULT 0 CHECK(verified_views>=0), reward INTEGER NOT NULL DEFAULT 0 CHECK(reward>=0),
 review_note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, reviewed_at INTEGER, reviewed_by TEXT,
 FOREIGN KEY(campaign_id,owner) REFERENCES clipper_memberships(campaign_id,owner)
);
--> statement-breakpoint
CREATE INDEX idx_clipper_submissions_owner ON clipper_submissions(owner,created_at);
--> statement-breakpoint
CREATE INDEX idx_clipper_submissions_campaign ON clipper_submissions(campaign_id,created_at);
--> statement-breakpoint
CREATE TRIGGER clipper_reward_budget BEFORE UPDATE OF status,reward ON clipper_submissions
WHEN NEW.status='approved' AND (SELECT COALESCE(SUM(reward),0) FROM clipper_submissions WHERE campaign_id=NEW.campaign_id AND status='approved' AND id<>NEW.id)+NEW.reward>(SELECT budget FROM clipper_campaigns WHERE id=NEW.campaign_id)
BEGIN SELECT RAISE(ABORT,'clipper_budget_exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER clipper_reward_total AFTER UPDATE OF status,reward ON clipper_submissions
BEGIN UPDATE clipper_campaigns SET approved_rewards=(SELECT COALESCE(SUM(reward),0) FROM clipper_submissions WHERE campaign_id=NEW.campaign_id AND status='approved') WHERE id=NEW.campaign_id; END;
