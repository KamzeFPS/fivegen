import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,index,uniqueIndex} from 'drizzle-orm/sqlite-core';
import {products} from './schema';

export const builderDesignGenerationRuns=sqliteTable('builder_design_generation_runs',{
 id:text('id').primaryKey(),productId:text('product_id').notNull().references(()=>products.id,{onDelete:'cascade'}),owner:text('owner').notNull(),
 expectedVersion:integer('expected_version').notNull(),productUpdatedAt:integer('product_updated_at').notNull(),draftSnapshot:text('draft_snapshot').notNull(),requestIntent:text('request_intent').notNull(),
 state:text('state',{enum:['pending','completed','failed']}).notNull(),cost:integer('cost').notNull(),response:text('response'),leaseExpiresAt:integer('lease_expires_at').notNull(),createdAt:integer('created_at').notNull(),
},table=>[index('idx_builder_design_generation_owner').on(table.productId,table.owner,table.state,table.leaseExpiresAt),uniqueIndex('idx_builder_design_generation_pending').on(table.productId,table.owner).where(sql`${table.state}='pending'`)]);
