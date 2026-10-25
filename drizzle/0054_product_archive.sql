ALTER TABLE products ADD COLUMN archived_at INTEGER;
--> statement-breakpoint
CREATE INDEX idx_products_owner_archive ON products(owner,archived_at,updated_at);
--> statement-breakpoint
CREATE TABLE product_archive_events (id TEXT PRIMARY KEY NOT NULL, product_id TEXT NOT NULL, owner TEXT NOT NULL, action TEXT NOT NULL CHECK(action IN ('archive','restore')), created_at INTEGER NOT NULL);
--> statement-breakpoint
CREATE INDEX idx_product_archive_history ON product_archive_events(owner,product_id,created_at);
--> statement-breakpoint
CREATE TRIGGER product_archive_effects AFTER UPDATE OF archived_at ON products
WHEN NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL
BEGIN
 INSERT INTO product_archive_events(id,product_id,owner,action,created_at) VALUES(lower(hex(randomblob(16))),NEW.id,NEW.owner,'archive',NEW.updated_at);
 UPDATE commerce_offers SET enabled=0,updated_at=MAX(updated_at+1,NEW.updated_at) WHERE product_id=NEW.id AND owner=NEW.owner;
 UPDATE commerce_offers SET enabled=0,updated_at=MAX(updated_at+1,NEW.updated_at) WHERE product_id IN(SELECT b.product_id FROM product_builder_publications b,json_each(b.public_snapshot,'$.studio.pricing.bundleProductIds') included WHERE b.owner=NEW.owner AND included.value=NEW.id);
 UPDATE product_pages SET published_at=NULL,updated_at=MAX(updated_at+1,NEW.updated_at) WHERE product_id=NEW.id AND owner=NEW.owner;
 UPDATE public_page_records SET published_at=NULL,updated_at=MAX(updated_at+1,NEW.updated_at) WHERE product_id=NEW.id AND owner=NEW.owner;
 UPDATE product_builder_publications SET published_at=0,updated_at=MAX(updated_at+1,NEW.updated_at) WHERE product_id=NEW.id AND owner=NEW.owner;
 UPDATE file_sale_drafts SET published_revision_id=NULL WHERE product_id=NEW.id;
 UPDATE growth_funnels SET published_at=NULL,updated_at=MAX(updated_at+1,NEW.updated_at) WHERE product_id=NEW.id AND owner=NEW.owner;
 UPDATE offer_experiments SET status='closed',updated_at=MAX(updated_at+1,NEW.updated_at) WHERE product_id=NEW.id AND owner=NEW.owner AND status='live';
 UPDATE automation_sequences SET status='paused',updated_at=MAX(updated_at+1,NEW.updated_at) WHERE product_id=NEW.id AND owner=NEW.owner AND status='active';
 UPDATE automation_jobs SET error='Product archived. Review and reactivate the paused sequence before sending.' WHERE product_id=NEW.id AND owner=NEW.owner AND status='pending';
END;
--> statement-breakpoint
CREATE TRIGGER product_restore_history AFTER UPDATE OF archived_at ON products
WHEN NEW.archived_at IS NULL AND OLD.archived_at IS NOT NULL
BEGIN
 INSERT INTO product_archive_events(id,product_id,owner,action,created_at) VALUES(lower(hex(randomblob(16))),NEW.id,NEW.owner,'restore',NEW.updated_at);
END;
--> statement-breakpoint
CREATE TRIGGER archive_guard_commerce_offers_insert BEFORE INSERT ON commerce_offers WHEN (NEW.enabled=1) AND EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND archived_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Restore the archived product before publishing, selling or activating email.'); END;
--> statement-breakpoint
CREATE TRIGGER archive_guard_commerce_offers_update BEFORE UPDATE OF enabled ON commerce_offers WHEN (NEW.enabled=1) AND EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND archived_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Restore the archived product before publishing, selling or activating email.'); END;
--> statement-breakpoint
CREATE TRIGGER archive_guard_product_pages_insert BEFORE INSERT ON product_pages WHEN (NEW.published_at IS NOT NULL) AND EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND archived_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Restore the archived product before publishing, selling or activating email.'); END;
--> statement-breakpoint
CREATE TRIGGER archive_guard_product_pages_update BEFORE UPDATE OF published_at ON product_pages WHEN (NEW.published_at IS NOT NULL) AND EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND archived_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Restore the archived product before publishing, selling or activating email.'); END;
--> statement-breakpoint
CREATE TRIGGER archive_guard_public_page_records_insert BEFORE INSERT ON public_page_records WHEN (NEW.published_at IS NOT NULL) AND EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND archived_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Restore the archived product before publishing, selling or activating email.'); END;
--> statement-breakpoint
CREATE TRIGGER archive_guard_public_page_records_update BEFORE UPDATE OF published_at ON public_page_records WHEN (NEW.published_at IS NOT NULL) AND EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND archived_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Restore the archived product before publishing, selling or activating email.'); END;
--> statement-breakpoint
CREATE TRIGGER archive_guard_product_builder_publications_insert BEFORE INSERT ON product_builder_publications WHEN (NEW.published_at>0) AND EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND archived_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Restore the archived product before publishing, selling or activating email.'); END;
--> statement-breakpoint
CREATE TRIGGER archive_guard_product_builder_publications_update BEFORE UPDATE OF published_at ON product_builder_publications WHEN (NEW.published_at>0) AND EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND archived_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Restore the archived product before publishing, selling or activating email.'); END;
--> statement-breakpoint
CREATE TRIGGER archive_guard_file_sale_drafts_insert BEFORE INSERT ON file_sale_drafts WHEN (NEW.published_revision_id IS NOT NULL) AND EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND archived_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Restore the archived product before publishing, selling or activating email.'); END;
--> statement-breakpoint
CREATE TRIGGER archive_guard_file_sale_drafts_update BEFORE UPDATE OF published_revision_id ON file_sale_drafts WHEN (NEW.published_revision_id IS NOT NULL) AND EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND archived_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Restore the archived product before publishing, selling or activating email.'); END;
--> statement-breakpoint
CREATE TRIGGER archive_guard_growth_funnels_insert BEFORE INSERT ON growth_funnels WHEN (NEW.published_at IS NOT NULL) AND EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND archived_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Restore the archived product before publishing, selling or activating email.'); END;
--> statement-breakpoint
CREATE TRIGGER archive_guard_growth_funnels_update BEFORE UPDATE OF published_at ON growth_funnels WHEN (NEW.published_at IS NOT NULL) AND EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND archived_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Restore the archived product before publishing, selling or activating email.'); END;
--> statement-breakpoint
CREATE TRIGGER archive_guard_offer_experiments_insert BEFORE INSERT ON offer_experiments WHEN (NEW.status='live') AND EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND archived_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Restore the archived product before publishing, selling or activating email.'); END;
--> statement-breakpoint
CREATE TRIGGER archive_guard_offer_experiments_update BEFORE UPDATE OF status ON offer_experiments WHEN (NEW.status='live') AND EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND archived_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Restore the archived product before publishing, selling or activating email.'); END;
--> statement-breakpoint
CREATE TRIGGER archive_guard_automation_sequences_insert BEFORE INSERT ON automation_sequences WHEN (NEW.status='active') AND EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND archived_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Restore the archived product before publishing, selling or activating email.'); END;
--> statement-breakpoint
CREATE TRIGGER archive_guard_automation_sequences_update BEFORE UPDATE OF status ON automation_sequences WHEN (NEW.status='active') AND EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND archived_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Restore the archived product before publishing, selling or activating email.'); END;
--> statement-breakpoint
CREATE TRIGGER archive_guard_automation_jobs_insert BEFORE INSERT ON automation_jobs WHEN (NEW.status='sending') AND EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND archived_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Restore the archived product before publishing, selling or activating email.'); END;
--> statement-breakpoint
CREATE TRIGGER archive_guard_automation_jobs_update BEFORE UPDATE OF status ON automation_jobs WHEN (NEW.status='sending') AND EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND archived_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'Restore the archived product before publishing, selling or activating email.'); END;
--> statement-breakpoint
CREATE TRIGGER archive_guard_commerce_orders_new BEFORE INSERT ON commerce_orders WHEN NEW.status='pending' AND EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND archived_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'This product is archived and cannot accept a new checkout.'); END;
--> statement-breakpoint
CREATE TRIGGER archive_guard_checkout_intents_new BEFORE INSERT ON checkout_intents WHEN EXISTS(SELECT 1 FROM products WHERE id=NEW.product_id AND archived_at IS NOT NULL) BEGIN SELECT RAISE(ABORT,'This product is archived and cannot accept a new checkout.'); END;
