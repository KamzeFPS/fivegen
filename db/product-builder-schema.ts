import {sqliteTable,text,integer,index,uniqueIndex,primaryKey} from 'drizzle-orm/sqlite-core';
import {products,uploads} from './schema';
import {commerceOrders} from './commerce-v2-schema';

// Builder state is additive. Existing file-sale revisions and commerce orders
// retain their original entitlement rules and are never converted in place.
export const productBuilderWorkspaces=sqliteTable('product_builder_workspaces',{
 productId:text('product_id').primaryKey().references(()=>products.id),owner:text('owner').notNull(),version:integer('version').notNull().default(1),data:text('data').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[index('idx_product_builder_owner').on(t.owner,t.updatedAt)]);
export const productBuilderPublications=sqliteTable('product_builder_publications',{
 productId:text('product_id').primaryKey().references(()=>products.id),owner:text('owner').notNull(),version:integer('version').notNull(),slug:text('slug').notNull(),publicSnapshot:text('public_snapshot').notNull(),contentSnapshot:text('content_snapshot').notNull(),uploadIds:text('upload_ids').notNull().default('[]'),publishedAt:integer('published_at').notNull(),updatedAt:integer('updated_at').notNull(),
},t=>[uniqueIndex('idx_product_builder_public_slug').on(t.slug)]);
export const productBuilderOrderSnapshots=sqliteTable('product_builder_order_snapshots',{
 orderId:text('order_id').primaryKey().references(()=>commerceOrders.id),productId:text('product_id').notNull().references(()=>products.id),publicationVersion:integer('publication_version').notNull(),snapshot:text('snapshot').notNull(),createdAt:integer('created_at').notNull(),
},t=>[index('idx_product_builder_order_product').on(t.productId)]);
export const productBuilderUploadGrants=sqliteTable('product_builder_upload_grants',{
 orderId:text('order_id').notNull().references(()=>commerceOrders.id),uploadId:text('upload_id').notNull().references(()=>uploads.id),publicationVersion:integer('publication_version').notNull(),createdAt:integer('created_at').notNull(),
},t=>[primaryKey({columns:[t.orderId,t.uploadId]})]);
