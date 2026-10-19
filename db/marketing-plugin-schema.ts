import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { products } from './schema';

// Explicit owner preferences only; legacy content never implicitly installs a
// plugin, and removing one never removes its drafts, publications or activity.
export const productMarketingPlugins = sqliteTable('product_marketing_plugins', {
  productId: text('product_id').primaryKey().references(() => products.id),
  owner: text('owner').notNull(),
  installed: text('installed').notNull().default('[]'),
  updatedAt: integer('updated_at').notNull(),
}, table => [index('idx_product_marketing_plugins_owner').on(table.owner)]);
