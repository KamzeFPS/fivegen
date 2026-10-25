import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const automationSequences = sqliteTable('automation_sequences', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), productId: text('product_id').notNull(),
  trigger: text('trigger').notNull(), status: text('status').notNull().default('draft'),
  draft: text('draft').notNull(), approved: text('approved'), revision: integer('revision').notNull(),
  approvedRevision: integer('approved_revision'), activatedAt: integer('activated_at'), updatedAt: integer('updated_at').notNull(),
}, t => [uniqueIndex('idx_automation_sequence_product_trigger').on(t.productId, t.trigger), index('idx_automation_sequence_owner').on(t.owner)]);

export const automationEnrollments = sqliteTable('automation_enrollments', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), productId: text('product_id').notNull(), sequenceId: text('sequence_id').notNull(),
  eventId: text('event_id').notNull(), email: text('email').notNull(), leadId: text('lead_id'), orderId: text('order_id'),
  revision: integer('revision').notNull(), snapshot: text('snapshot').notNull(), createdAt: integer('created_at').notNull(),
}, t => [uniqueIndex('idx_automation_enrollment_event').on(t.sequenceId, t.eventId), index('idx_automation_enrollment_owner_email').on(t.owner, t.email)]);

export const automationJobs = sqliteTable('automation_jobs', {
  id: text('id').primaryKey(), enrollmentId: text('enrollment_id').notNull(), owner: text('owner').notNull(), productId: text('product_id').notNull(),
  stepIndex: integer('step_index').notNull(), status: text('status').notNull().default('pending'),
  dueAt: integer('due_at').notNull(), lease: integer('lease').notNull().default(0), attempts: integer('attempts').notNull().default(0),
  firstAttemptAt: integer('first_attempt_at'), sentAt: integer('sent_at'), providerId: text('provider_id'), error: text('error').notNull().default(''),
}, t => [uniqueIndex('idx_automation_job_step').on(t.enrollmentId, t.stepIndex), index('idx_automation_job_due').on(t.status, t.dueAt), index('idx_automation_job_owner').on(t.owner, t.productId)]);

export const automationSuppressions = sqliteTable('automation_suppressions', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), email: text('email').notNull(), createdAt: integer('created_at').notNull(),
}, t => [uniqueIndex('idx_automation_suppression_owner_email').on(t.owner, t.email)]);

export const automationUnsubscribeTokens = sqliteTable('automation_unsubscribe_tokens', {
  hash: text('hash').primaryKey(), owner: text('owner').notNull(), email: text('email').notNull(), enrollmentId: text('enrollment_id').notNull(), createdAt: integer('created_at').notNull(),
}, t => [uniqueIndex('idx_automation_unsubscribe_enrollment').on(t.enrollmentId)]);

export const automationRelationshipEvents = sqliteTable('automation_relationship_events', {
  id:text('id').primaryKey(), owner:text('owner').notNull(), productId:text('product_id').notNull(),
  trigger:text('trigger').notNull(), referenceKind:text('reference_kind').notNull(), referenceId:text('reference_id').notNull(), orderId:text('order_id'),
  email:text('email').notNull(), name:text('name').notNull().default(''), occurredAt:integer('occurred_at').notNull(), startsAt:integer('starts_at'), label:text('label').notNull().default(''),
  suppressedAt:integer('suppressed_at'), suppressionReason:text('suppression_reason').notNull().default(''),
}, t=>[index('relationship_automation_pending').on(t.owner,t.productId,t.trigger,t.occurredAt)]);
