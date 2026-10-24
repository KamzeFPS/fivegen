import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const productPages = sqliteTable('product_pages', {
  productId: text('product_id').primaryKey(), owner: text('owner').notNull(),
  draft: text('draft').notNull(), published: text('published'), publicProduct: text('public_product'),
  publishedAt: integer('published_at'), updatedAt: integer('updated_at').notNull(),
}, table => [index('idx_product_pages_owner').on(table.owner)]);

export const productReviews = sqliteTable('product_reviews', {
  id: text('id').primaryKey(), productId: text('product_id').notNull(), owner: text('owner').notNull(),
  orderId: text('order_id').notNull(), email: text('email').notNull(), displayName: text('display_name').notNull(),
  rating: integer('rating').notNull(), body: text('body').notNull(), createdAt: integer('created_at').notNull(),
}, table => [
  uniqueIndex('idx_product_review_order').on(table.orderId),
  uniqueIndex('idx_product_review_buyer').on(table.productId, table.email),
  index('idx_product_reviews_product_date').on(table.productId, table.createdAt),
]);
