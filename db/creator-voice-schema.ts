import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const creatorVoiceSources = sqliteTable('creator_voice_sources', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), productId: text('product_id').notNull(),
  title: text('title').notNull(), kind: text('kind').notNull(), transcript: text('transcript').notNull().default(''),
  evidence: text('evidence').notNull().default(''), uploadId: text('upload_id'),
  permission: integer('permission').notNull().default(0), approved: integer('approved').notNull().default(0),
  lease: integer('lease').notNull().default(0), leaseId: text('lease_id'), updatedAt: integer('updated_at').notNull(),
}, table => [index('idx_voice_owner').on(table.owner, table.updatedAt)]);
export const creatorCampaigns = sqliteTable('creator_campaigns', {
  productId: text('product_id').primaryKey(), owner: text('owner').notNull(), title: text('title').notNull(),
  goal: text('goal').notNull().default(''), sourceIds: text('source_ids').notNull().default('[]'),
  items: text('items').notNull().default('[]'), sourceRevisions: text('source_revisions').notNull().default('[]'),
  lease: integer('lease').notNull().default(0), leaseId: text('lease_id'), updatedAt: integer('updated_at').notNull(),
}, table => [index('idx_campaign_owner').on(table.owner, table.updatedAt)]);
export const creatorAiRuns = sqliteTable('creator_ai_runs', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), kind: text('kind').notNull(), targetId: text('target_id').notNull(),
  expectedUpdatedAt: integer('expected_updated_at').notNull(), state: text('state').notNull(), response: text('response'),
  cost: integer('cost').notNull(), createdAt: integer('created_at').notNull(),
}, table => [index('idx_creator_runs_owner').on(table.owner, table.kind, table.targetId, table.createdAt)]);
