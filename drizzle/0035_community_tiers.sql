CREATE TABLE product_community_onboarding (
 order_id TEXT NOT NULL REFERENCES commerce_orders(id), step_id TEXT NOT NULL,
 completed_at INTEGER NOT NULL, reference_id TEXT NOT NULL DEFAULT '', PRIMARY KEY(order_id,step_id)
);
--> statement-breakpoint
CREATE TABLE product_community_prompt_posts (
 product_id TEXT NOT NULL, owner TEXT NOT NULL, mode TEXT NOT NULL,
 prompt_id TEXT NOT NULL, local_day TEXT NOT NULL, post_id TEXT NOT NULL UNIQUE,
 publication_version INTEGER NOT NULL, prompt_snapshot TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(product_id,mode,prompt_id,local_day)
);
--> statement-breakpoint
CREATE TABLE product_community_schedule_cursor (
 id TEXT PRIMARY KEY, last_product_id TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL
);
