import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const offerExperiments = sqliteTable('offer_experiments', {
  productId: text('product_id').primaryKey(), owner: text('owner').notNull(),
  slug: text('slug').notNull().unique(), draft: text('draft').notNull(), published: text('published'),
  status: text('status').notNull().default('draft'), revision: integer('revision').notNull(),
  publishedRevision: integer('published_revision'), publishedAt: integer('published_at'),
  updatedAt: integer('updated_at').notNull(),
}, t => [index('idx_offer_experiments_owner').on(t.owner)]);

// Each published comparison is immutable so earlier responses always retain
// the exact prices, promises and deliverables their respondents evaluated.
export const offerRounds = sqliteTable('offer_rounds', {
  id: text('id').primaryKey(), productId: text('product_id').notNull(), owner: text('owner').notNull(),
  revision: integer('revision').notNull(), study: text('study').notNull(), createdAt: integer('created_at').notNull(),
}, t => [uniqueIndex('idx_offer_round_revision').on(t.productId, t.revision), index('idx_offer_round_owner').on(t.owner, t.productId)]);

export const offerVisitors = sqliteTable('offer_visitors', {
  id: text('id').primaryKey(), productId: text('product_id').notNull(), owner: text('owner').notNull(),
  revision: integer('revision').notNull(), visitor: text('visitor').notNull(), createdAt: integer('created_at').notNull(),
}, t => [uniqueIndex('idx_offer_visitors_once').on(t.productId, t.revision, t.visitor)]);

export const offerResponses = sqliteTable('offer_responses', {
  id: text('id').primaryKey(), productId: text('product_id').notNull(), owner: text('owner').notNull(),
  revision: integer('revision').notNull(), visitor: text('visitor').notNull(), preference: text('preference').notNull(),
  readiness: text('readiness').notNull(), feedback: text('feedback').notNull(), email: text('email'),
  createdAt: integer('created_at').notNull(),
}, t => [uniqueIndex('idx_offer_response_visitor').on(t.productId, t.revision, t.visitor),
  uniqueIndex('idx_offer_response_email').on(t.productId, t.revision, t.email), index('idx_offer_responses_owner').on(t.owner, t.createdAt)]);

// Anonymous, explicitly bounded event vocabulary. No IPs, email addresses,
// page text, referrer URLs, or cross-site identifiers are recorded here.
export const growthEvents = sqliteTable('growth_events', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), productId: text('product_id').notNull(),
  visitor: text('visitor').notNull(), event: text('event').notNull(), campaign: text('campaign').notNull().default('direct'),
  day: text('day').notNull(), createdAt: integer('created_at').notNull(),
}, t => [uniqueIndex('idx_growth_event_once').on(t.productId, t.visitor, t.event, t.day), index('idx_growth_events_owner_time').on(t.owner, t.createdAt)]);
