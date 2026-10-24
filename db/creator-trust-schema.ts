import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,index,primaryKey,check} from 'drizzle-orm/sqlite-core';
import {products} from './schema';

export const creatorContextProfiles=sqliteTable('creator_context_profiles',{
 owner:text('owner').primaryKey(),enabled:integer('enabled').notNull().default(0),approved:integer('approved').notNull().default(0),data:text('data').notNull().default('{}'),updatedAt:integer('updated_at').notNull(),
});
export const creatorProductContext=sqliteTable('creator_product_context',{
 productId:text('product_id').primaryKey().references(()=>products.id,{onDelete:'cascade'}),owner:text('owner').notNull(),useProfile:integer('use_profile').notNull().default(0),sourceIds:text('source_ids').notNull().default('[]'),updatedAt:integer('updated_at').notNull(),
},t=>[index('creator_product_context_owner').on(t.owner,t.productId)]);
export const creatorContextProposals=sqliteTable('creator_context_proposals',{
 owner:text('owner').notNull(),productId:text('product_id').notNull().references(()=>products.id,{onDelete:'cascade'}),messageId:text('message_id').notNull(),refs:text('refs').notNull(),createdAt:integer('created_at').notNull(),
},t=>[primaryKey({columns:[t.owner,t.productId,t.messageId]})]);
export const productEditorialReviews=sqliteTable('product_editorial_reviews',{
 productId:text('product_id').notNull().references(()=>products.id),owner:text('owner').notNull(),mode:text('mode').notNull(),version:integer('version').notNull(),fingerprint:text('fingerprint').notNull(),engineVersion:integer('engine_version').notNull(),records:text('records').notNull().default('{}'),approvedAt:integer('approved_at'),finalNote:text('final_note').notNull().default(''),updatedAt:integer('updated_at').notNull(),
},t=>[primaryKey({columns:[t.productId,t.owner,t.mode,t.version,t.fingerprint]}),check('product_editorial_review_mode',sql`${t.mode} IN ('test','live')`)]);
export const creatorLaunchJourneys=sqliteTable('creator_launch_journeys',{
 productId:text('product_id').primaryKey().notNull().references(()=>products.id),owner:text('owner').notNull(),feedback:text('feedback').notNull().default('[]'),sharedAt:integer('shared_at'),sharedPublicationVersion:integer('shared_publication_version'),sharedChannel:text('shared_channel').notNull().default(''),updatedAt:integer('updated_at').notNull().default(0),
},t=>[index('creator_launch_owner').on(t.owner,t.productId),check('creator_launch_feedback',sql`json_valid(${t.feedback}) AND length(${t.feedback})<=40000`)]);
