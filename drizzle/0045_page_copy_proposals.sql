CREATE TABLE page_copy_proposals (
 id text PRIMARY KEY NOT NULL,
 owner text NOT NULL,
 product_id text NOT NULL REFERENCES products(id),
 request text NOT NULL,
 proposal text,
 created_at integer NOT NULL,
 updated_at integer NOT NULL,
 lease integer DEFAULT 0 NOT NULL,
 lease_id text
);
--> statement-breakpoint
CREATE INDEX page_copy_proposals_owner ON page_copy_proposals(owner,product_id,created_at);
