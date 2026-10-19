import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const growthWorkspaces = sqliteTable('growth_workspaces', {
  productId: text('product_id').primaryKey(), owner: text('owner').notNull(),
  brief: text('brief').notNull(), assets: text('assets'),
  lease: integer('lease').notNull().default(0), leaseId: text('lease_id'),
  updatedAt: integer('updated_at').notNull().default(0),
}, table => [index('idx_growth_workspaces_owner').on(table.owner)]);
export const growthGenerationRuns = sqliteTable('growth_generation_runs', {
  id: text('id').primaryKey(), owner: text('owner').notNull(), productId: text('product_id').notNull(),
  expectedUpdatedAt: integer('expected_updated_at').notNull(), state: text('state').notNull(),
  response: text('response'), cost: integer('cost').notNull().default(0),
  createdAt: integer('created_at').notNull(),
}, table => [index('idx_growth_runs_owner').on(table.owner, table.createdAt)]);
