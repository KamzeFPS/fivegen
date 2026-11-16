CREATE TABLE clipper_videos (
 id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, campaign_id TEXT NOT NULL REFERENCES clipper_campaigns(id),
 object_key TEXT NOT NULL UNIQUE, name TEXT NOT NULL, mime TEXT NOT NULL CHECK(mime='video/mp4'),
 size INTEGER NOT NULL CHECK(size>0 AND size<=104857600), sha256 TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','completed','failed')),
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_clipper_videos_owner ON clipper_videos(owner,created_at);
--> statement-breakpoint
CREATE TABLE clipper_submissions_video (
 id TEXT PRIMARY KEY NOT NULL, campaign_id TEXT NOT NULL, owner TEXT NOT NULL,
 display_name TEXT NOT NULL, platform TEXT NOT NULL CHECK(platform IN ('tiktok','instagram','youtube','upload')),
 url TEXT NOT NULL UNIQUE, post_key TEXT NOT NULL UNIQUE, video_id TEXT REFERENCES clipper_videos(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 verified_views INTEGER NOT NULL DEFAULT 0 CHECK(verified_views>=0), reward INTEGER NOT NULL DEFAULT 0 CHECK(reward>=0),
 review_note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, reviewed_at INTEGER, reviewed_by TEXT,
 CHECK((video_id IS NULL AND platform<>'upload') OR (video_id IS NOT NULL AND platform='upload')),
 FOREIGN KEY(campaign_id,owner) REFERENCES clipper_memberships(campaign_id,owner)
);
--> statement-breakpoint
INSERT INTO clipper_submissions_video(id,campaign_id,owner,display_name,platform,url,post_key,status,verified_views,reward,review_note,created_at,reviewed_at,reviewed_by)
 SELECT id,campaign_id,owner,display_name,platform,url,post_key,status,verified_views,reward,review_note,created_at,reviewed_at,reviewed_by FROM clipper_submissions;
--> statement-breakpoint
DROP TRIGGER clipper_reward_budget;
--> statement-breakpoint
DROP TRIGGER clipper_reward_total;
--> statement-breakpoint
DROP TABLE clipper_submissions;
--> statement-breakpoint
ALTER TABLE clipper_submissions_video RENAME TO clipper_submissions;
--> statement-breakpoint
CREATE INDEX idx_clipper_submissions_owner ON clipper_submissions(owner,created_at);
--> statement-breakpoint
CREATE INDEX idx_clipper_submissions_campaign ON clipper_submissions(campaign_id,created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_clipper_submission_video ON clipper_submissions(video_id) WHERE video_id IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER clipper_reward_budget BEFORE UPDATE OF status,reward ON clipper_submissions
 WHEN NEW.status='approved' AND (SELECT COALESCE(SUM(reward),0) FROM clipper_submissions WHERE campaign_id=NEW.campaign_id AND status='approved' AND id<>NEW.id)+NEW.reward>(SELECT budget FROM clipper_campaigns WHERE id=NEW.campaign_id)
 BEGIN SELECT RAISE(ABORT,'clipper_budget_exceeded'); END;
--> statement-breakpoint
CREATE TRIGGER clipper_reward_total AFTER UPDATE OF status,reward ON clipper_submissions
 BEGIN UPDATE clipper_campaigns SET approved_rewards=(SELECT COALESCE(SUM(reward),0) FROM clipper_submissions WHERE campaign_id=NEW.campaign_id AND status='approved') WHERE id=NEW.campaign_id; END;
