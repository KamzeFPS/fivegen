import { z } from 'zod';
import { ApiError, database } from './server';

export const productDeletionSchema = z.object({
  title: z.string().min(1).max(500),
  expectedUpdatedAt: z.number().int().nonnegative(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
});

// These are private draft versions, independent of products.updated_at. Include
// their actual values so editing a builder, page or campaign invalidates an open
// delete dialog even when the product's own row was not updated.
const revisionTables = [
  ['product_builder_workspaces', ['version', 'data', 'updated_at'], 'product_id'],
  ['product_builder_publications', ['version', 'content_snapshot', 'updated_at'], 'product_id'],
  ['file_sale_drafts', ['version', 'data', 'published_revision_id'], 'product_id'],
  ['product_pages', ['draft', 'published', 'updated_at'], 'product_id'],
  ['public_page_records', ['id', 'draft', 'published', 'updated_at'], 'id'],
  ['growth_workspaces', ['brief', 'assets', 'context_refs', 'updated_at'], 'product_id'],
  ['funnel_builder_workspaces', ['brief', 'graph', 'strategy', 'strategy_brief', 'updated_at'], 'product_id'],
  ['growth_funnel_drafts', ['creator_vsl_upload_id', 'updated_at'], 'product_id'],
  ['growth_funnels', ['landing', 'creator_vsl_upload_id', 'published_at', 'updated_at'], 'product_id'],
  ['marketing_campaigns', ['id', 'title', 'goal', 'items', 'destination', 'updated_at'], 'id'],
  ['automation_sequences', ['id', 'status', 'draft', 'approved', 'revision', 'updated_at'], 'id'],
  ['creator_product_context', ['source_ids', 'updated_at'], 'product_id'],
  ['offer_experiments', ['draft', 'published', 'revision', 'updated_at'], 'product_id'],
  ['product_page_experiments', ['draft', 'revision', 'updated_at'], 'product_id'],
  ['product_marketing_plugins', ['installed', 'updated_at'], 'product_id'],
] as const;
const revisionSql = `json_array(${revisionTables.map(([table, columns, order]) =>
  `(SELECT json_group_array(json_array(${columns.join(',')})) FROM (SELECT ${columns.join(',')} FROM ${table} WHERE product_id=p.id ORDER BY ${order}))`,
).join(',')})`;

type Blocker = { message: string; sql: string };
const any = (table: string, where = '') => `EXISTS(SELECT 1 FROM ${table} WHERE product_id=p.id${where ? ` AND (${where})` : ''})`;
const blockers: Blocker[] = [
  {
    message: 'This product has orders or payment records. It cannot be deleted because customer access and financial history must be retained.',
    sql: ['orders', 'commerce_orders', 'checkout_intents', 'product_builder_order_snapshots', 'product_bundle_entitlements', 'commerce_order_journeys', 'product_page_experiment_orders', 'referral_commissions', 'purchase_emails'].map(table => any(table)).join(' OR ')
      + ['orders', 'checkout_intents'].map(table => ` OR EXISTS(SELECT 1 FROM ${table} historical WHERE EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(historical.items) THEN historical.items ELSE '[]' END) item WHERE json_extract(CASE WHEN item.type='object' THEN item.value ELSE '{}' END,'$.id')=p.id))`).join(''),
  },
  {
    message: 'This product has customers, bookings or member activity. It cannot be deleted while their access and records must be retained.',
    sql: ['bookings', 'commerce_bookings', 'product_service_sessions', 'product_enrollments', 'product_team_seats', 'product_custom_fulfillment', 'product_student_files', 'product_reviews', 'product_learning_comments', 'product_community_reports', 'product_service_messages', 'buyer_help_cases', 'lesson_progress'].map(table => any(table)).join(' OR ')
      + ` OR ${any('community_posts', 'user_id<>p.owner')} OR ${any('product_community_posts', 'order_id IS NOT NULL')}`,
  },
  {
    message: 'AI generation or an upload is still in progress. Finish or stop that work before deleting this product.',
    sql: `${any('generation', "status NOT IN ('completed','failed','cancelled') OR lease>?1")}
      OR ${any('assets', "status NOT IN ('completed','failed','cancelled')")}
      OR ${any('uploads', "status NOT IN ('completed','failed')")}
      OR ${any('growth_generation_runs', "state='pending'")}
      OR ${any('growth_workspaces', 'lease>?1')}
      OR ${any('funnel_builder_workspaces', 'lease>?1')}
      OR ${any('funnel_builder_runs', "state='pending'")}
      OR ${any('creator_campaigns', 'lease>?1')}
      OR ${any('marketing_campaigns', 'lease>?1')}
      OR ${any('page_copy_proposals', 'lease>?1')}
      OR ${any('creator_voice_sources', 'lease>?1')}
      OR EXISTS(SELECT 1 FROM studio_conversations WHERE product_id=p.id AND lease>?1)
      OR EXISTS(SELECT 1 FROM creator_ai_runs r WHERE r.state='pending' AND (
        r.target_id=p.id
        OR r.target_id IN(SELECT id FROM marketing_campaigns WHERE product_id=p.id)
        OR r.target_id IN(SELECT id FROM creator_voice_sources WHERE product_id=p.id)
        OR r.target_id IN(SELECT id FROM page_copy_proposals WHERE product_id=p.id)))
      OR EXISTS(SELECT 1 FROM credit_usage c WHERE c.state='reserved' AND (
        c.id IN(SELECT id FROM assets WHERE product_id=p.id)
        OR c.id IN(SELECT id FROM growth_generation_runs WHERE product_id=p.id)
        OR c.id IN(SELECT 'funnel-builder:'||id FROM funnel_builder_runs WHERE product_id=p.id)
        OR c.id IN(SELECT id FROM ai_product_runs WHERE product_id=p.id)
        OR c.id IN(SELECT r.id FROM creator_ai_runs r WHERE r.target_id=p.id
          OR r.target_id IN(SELECT id FROM marketing_campaigns WHERE product_id=p.id)
          OR r.target_id IN(SELECT id FROM creator_voice_sources WHERE product_id=p.id)
          OR r.target_id IN(SELECT id FROM page_copy_proposals WHERE product_id=p.id))))`,
  },
  {
    message: 'Email automations or scheduled delivery are active. Pause the sequences and finish or cancel pending jobs before deleting this product.',
    sql: `${any('automation_sequences', "status='active'")}
      OR ${any('automation_jobs', "status IN ('pending','sending') OR lease>?1")}
      OR ${any('product_reminder_jobs', "status IN ('pending','sending') OR lease>?1")}`,
  },
  {
    message: 'A collaborator change is still being saved. Wait for it to finish before deleting this product.',
    sql: any('creator_collaboration_events', "status='pending'"),
  },
  {
    message: 'Another product includes this product in a bundle. Remove it from that bundle before deleting it.',
    sql: `EXISTS(SELECT 1 FROM product_builder_workspaces w WHERE w.product_id<>p.id AND EXISTS(SELECT 1 FROM json_each(w.data,'$.studio.pricing.bundleProductIds') WHERE value=p.id))
      OR EXISTS(SELECT 1 FROM product_builder_publications b WHERE b.product_id<>p.id AND EXISTS(SELECT 1 FROM json_each(b.content_snapshot,'$.studio.pricing.bundleProductIds') WHERE value=p.id))
      OR EXISTS(SELECT 1 FROM products included WHERE included.id<>p.id AND (json_extract(included.commerce,'$.deal.productId')=p.id OR json_extract(included.commerce,'$.upsell.productId')=p.id OR json_extract(included.commerce,'$.funnel.leadProductId')=p.id))`,
  },
];
const blockerSql = blockers.map(item => `(${item.sql})`).join(' OR ');

async function deletionState(productId: string, owner: string) {
  const now = Date.now();
  // Numbered ?1 lets all lease checks use one stable instant in SQLite and D1.
  const row = await database().prepare(`SELECT p.id,p.title,p.updated_at,${revisionSql} AS snapshot,${blockers.map((item, index) => `(${item.sql}) AS blocker_${index}`).join(',')}
    FROM products p WHERE p.id=?2 AND p.owner=?3`).bind(now, productId, owner).first();
  if (!row) throw new ApiError('Product not found.', 404);
  const snapshot = String(row.snapshot);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([String(row.id), String(row.title), Number(row.updated_at), snapshot])));
  return {
    snapshot,
    revision: Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join(''),
    product: { id: String(row.id), title: String(row.title), updatedAt: Number(row.updated_at) },
    blockers: blockers.filter((_, index) => Number(row[`blocker_${index}`])).map(item => item.message),
  };
}

export async function getProductDeletion(productId: string, owner: string) {
  const { snapshot: _snapshot, ...state } = await deletionState(productId, owner);
  return { ...state, canDelete: state.blockers.length === 0 };
}

// Only product-local rows are removed. Spend/quota records, global library
// sources, unsubscribe/suppression records and provider accounts are retained.
// Files referenced by the Creator Library stay owner-only and keep their origin
// product ID. Unreferenced object bytes are not deleted here: external storage
// mutations cannot participate in the database transaction.
const deleteTables = [
  'public_page_form_receipts', 'public_page_revisions', 'public_page_records',
  'product_page_revisions', 'product_pages',
  'product_page_experiment_assignments', 'product_page_experiment_runs', 'product_page_experiments',
  'campaign_email_links', 'campaign_email_imports', 'campaign_versions', 'marketing_campaign_selection',
  'marketing_draft_versions', 'marketing_campaigns', 'creator_campaigns',
  'creator_collaboration_events', 'creator_collaborators',
  'page_copy_proposals', 'connected_marketing_launches', 'creator_launch_journeys',
  'growth_plan_reviews', 'growth_asset_proposals', 'creator_product_context', 'creator_context_proposals',
  'growth_funnel_drafts', 'growth_funnels', 'growth_workspaces', 'growth_events', 'growth_leads',
  'funnel_builder_runs', 'funnel_builder_workspaces',
  'offer_responses', 'offer_visitors', 'offer_rounds', 'offer_experiments',
  'product_share_links', 'product_journey_events', 'creator_reply_templates', 'product_marketing_plugins',
  'product_editorial_reviews', 'product_builder_revisions', 'product_builder_publications', 'product_builder_workspaces',
  'file_sale_drafts', 'file_sale_revisions', 'file_sale_events',
  'automation_jobs', 'automation_enrollments', 'automation_sequences',
  'commerce_offers', 'commerce_slots', 'booking_slots', 'referral_invites',
  'community_posts', 'product_community_prompt_posts', 'product_community_posts',
  'leads', 'visits', 'generation', 'assets',
] as const;

export async function deleteProduct(productId: string, owner: string, value: unknown) {
  const input = productDeletionSchema.parse(value), state = await deletionState(productId, owner);
  if (input.title !== state.product.title) throw new ApiError('Type the product name exactly to confirm deletion.', 409);
  if (input.expectedUpdatedAt !== state.product.updatedAt || input.revision !== state.revision)
    throw new ApiError('This product changed. Close this dialog and review it again before deleting.', 409);
  if (state.blockers.length) throw new ApiError(state.blockers.join(' '), 409);
  const db = database(), now = Date.now(), claimAt = Math.max(now, input.expectedUpdatedAt + 1);
  const claimed = 'EXISTS(SELECT 1 FROM products WHERE id=? AND owner=? AND status=\'deleting\' AND updated_at=?)';
  const guardValues = [productId, owner, claimAt];
  const statements = [db.prepare(`UPDATE products AS p SET status='deleting',updated_at=?4
    WHERE id=?2 AND owner=?3 AND title=?5 AND updated_at=?6 AND ${revisionSql}=?7 AND NOT(${blockerSql})`)
    .bind(now, productId, owner, claimAt, input.title, input.expectedUpdatedAt, state.snapshot)];
  // Cross references must be removed before their product-local parents.
  statements.push(db.prepare(`DELETE FROM service_application_reviews WHERE application_id IN(SELECT id FROM service_applications WHERE product_id=?) AND ${claimed}`).bind(productId, ...guardValues));
  statements.push(db.prepare(`DELETE FROM service_applications WHERE product_id=? AND ${claimed}`).bind(productId, ...guardValues));
  statements.push(db.prepare(`DELETE FROM product_community_reactions WHERE post_id IN(SELECT id FROM product_community_posts WHERE product_id=?) AND ${claimed}`).bind(productId, ...guardValues));
  statements.push(db.prepare(`DELETE FROM product_community_votes WHERE post_id IN(SELECT id FROM product_community_posts WHERE product_id=?) AND ${claimed}`).bind(productId, ...guardValues));
  for (const table of deleteTables) statements.push(db.prepare(`DELETE FROM ${table} WHERE product_id=? AND ${claimed}`).bind(productId, ...guardValues));
  statements.push(db.prepare(`DELETE FROM uploads WHERE product_id=? AND owner=? AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id) AND NOT EXISTS(SELECT 1 FROM page_brand_presets WHERE icon_upload_id=uploads.id) AND ${claimed}`).bind(productId, owner, ...guardValues));
  statements.push(db.prepare(`UPDATE studio_conversations SET product_id=NULL WHERE product_id=? AND owner=? AND ${claimed}`).bind(productId, owner, ...guardValues));
  statements.push(db.prepare("DELETE FROM products WHERE id=? AND owner=? AND status='deleting' AND updated_at=?").bind(...guardValues));
  const results = await db.batch(statements);
  if (!results[0].meta.changes || !results[results.length - 1].meta.changes) {
    const latest = await getProductDeletion(productId, owner);
    throw new ApiError(latest.blockers.length ? latest.blockers.join(' ') : 'This product changed. Close this dialog and review it again before deleting.', 409);
  }
  return { deleted: true as const };
}
