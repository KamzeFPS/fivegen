-- Durable source events are written in the same transaction as the real action.
-- No backfill: activating a sequence never silently enrolls historical contacts.
CREATE TABLE automation_relationship_events (
 id TEXT PRIMARY KEY,
 owner TEXT NOT NULL,
 product_id TEXT NOT NULL,
 trigger TEXT NOT NULL CHECK(trigger IN('application','booking','cancellation')),
 reference_kind TEXT NOT NULL CHECK(reference_kind IN('application','booking','session','subscription')),
 reference_id TEXT NOT NULL,
 order_id TEXT,
 email TEXT NOT NULL,
 name TEXT NOT NULL DEFAULT '',
 occurred_at INTEGER NOT NULL,
 starts_at INTEGER,
 label TEXT NOT NULL DEFAULT '',
 suppressed_at INTEGER,
 suppression_reason TEXT NOT NULL DEFAULT ''
);
CREATE INDEX relationship_automation_pending ON automation_relationship_events(owner,product_id,trigger,occurred_at);

CREATE TRIGGER relationship_application_received AFTER INSERT ON service_applications
BEGIN
 INSERT OR IGNORE INTO automation_relationship_events(id,owner,product_id,trigger,reference_kind,reference_id,email,name,occurred_at,label)
 SELECT 'application:'||NEW.id,NEW.owner,NEW.product_id,'application','application',NEW.id,lower(NEW.email),NEW.name,NEW.created_at,'application'
 WHERE NEW.consent_at>0 AND length(NEW.review_consent)>0;
END;

CREATE TRIGGER relationship_booking_created AFTER INSERT ON commerce_bookings WHEN NEW.status='confirmed' AND NEW.mode='live'
BEGIN
 INSERT OR IGNORE INTO automation_relationship_events(id,owner,product_id,trigger,reference_kind,reference_id,order_id,email,name,occurred_at,starts_at,label)
 SELECT 'booking:'||NEW.id,NEW.owner,NEW.product_id,'booking','booking',NEW.id,NEW.order_id,lower(o.email),'',NEW.created_at,s.starts_at,'session'
 FROM commerce_orders o JOIN commerce_slots s ON s.id=NEW.slot_id
 WHERE o.id=NEW.order_id AND o.owner=NEW.owner AND o.product_id=NEW.product_id AND o.mode='live' AND o.status='paid';
END;

CREATE TRIGGER relationship_booking_cancelled AFTER UPDATE OF status ON commerce_bookings WHEN OLD.status='confirmed' AND NEW.status='cancelled' AND NEW.mode='live'
BEGIN
 INSERT OR IGNORE INTO automation_relationship_events(id,owner,product_id,trigger,reference_kind,reference_id,order_id,email,name,occurred_at,starts_at,label)
 SELECT 'cancellation:booking:'||NEW.id,NEW.owner,NEW.product_id,'cancellation','booking',NEW.id,NEW.order_id,lower(o.email),'',CAST(ROUND((julianday('now')-2440587.5)*86400000) AS INTEGER),s.starts_at,'session'
 FROM commerce_orders o JOIN commerce_slots s ON s.id=NEW.slot_id
 WHERE o.id=NEW.order_id AND o.owner=NEW.owner AND o.product_id=NEW.product_id AND o.mode='live';
END;

CREATE TRIGGER relationship_session_created AFTER INSERT ON product_service_sessions WHEN NEW.status='confirmed' AND NEW.mode='live'
BEGIN
 INSERT OR IGNORE INTO automation_relationship_events(id,owner,product_id,trigger,reference_kind,reference_id,order_id,email,name,occurred_at,starts_at,label)
 SELECT 'booking:session:'||NEW.id||':'||NEW.updated_at,NEW.owner,NEW.product_id,'booking','session',NEW.id,NEW.order_id,lower(o.email),'',NEW.created_at,NEW.starts_at,'session'
 FROM commerce_orders o WHERE o.id=NEW.order_id AND o.owner=NEW.owner AND o.product_id=NEW.product_id AND o.mode='live' AND o.status='paid';
END;
CREATE TRIGGER relationship_session_rescheduled AFTER UPDATE OF starts_at ON product_service_sessions WHEN NEW.status='confirmed' AND NEW.mode='live' AND NEW.starts_at!=OLD.starts_at
BEGIN
 INSERT OR IGNORE INTO automation_relationship_events(id,owner,product_id,trigger,reference_kind,reference_id,order_id,email,name,occurred_at,starts_at,label)
 SELECT 'booking:session:'||NEW.id||':'||NEW.updated_at,NEW.owner,NEW.product_id,'booking','session',NEW.id,NEW.order_id,lower(o.email),'',NEW.updated_at,NEW.starts_at,'rescheduled session'
 FROM commerce_orders o WHERE o.id=NEW.order_id AND o.owner=NEW.owner AND o.product_id=NEW.product_id AND o.mode='live' AND o.status='paid';
END;
CREATE TRIGGER relationship_session_cancelled AFTER UPDATE OF status ON product_service_sessions WHEN OLD.status='confirmed' AND NEW.status='cancelled' AND NEW.mode='live'
BEGIN
 INSERT OR IGNORE INTO automation_relationship_events(id,owner,product_id,trigger,reference_kind,reference_id,order_id,email,name,occurred_at,starts_at,label)
 SELECT 'cancellation:session:'||NEW.id||':'||NEW.updated_at,NEW.owner,NEW.product_id,'cancellation','session',NEW.id,NEW.order_id,lower(o.email),'',NEW.updated_at,NEW.starts_at,'session'
 FROM commerce_orders o WHERE o.id=NEW.order_id AND o.owner=NEW.owner AND o.product_id=NEW.product_id AND o.mode='live';
END;

-- A provider-verified canceled subscription is different from a scheduled
-- cancellation, a failed invoice, or marketing unsubscribe.
CREATE TRIGGER relationship_subscription_ended AFTER UPDATE OF status ON product_commerce_intents WHEN NEW.pricing_model='subscription' AND NEW.status='canceled' AND OLD.status!='canceled'
BEGIN
 INSERT OR IGNORE INTO automation_relationship_events(id,owner,product_id,trigger,reference_kind,reference_id,order_id,email,name,occurred_at,label)
 SELECT 'cancellation:subscription:'||NEW.order_id, o.owner,o.product_id,'cancellation','subscription',NEW.order_id,NEW.order_id,lower(o.email),'',NEW.updated_at,'membership'
 FROM commerce_orders o WHERE o.id=NEW.order_id AND o.mode='live';
END;
