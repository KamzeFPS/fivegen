import { z } from 'zod';
import { ApiError, database, ownedProduct } from './server';
import { completeOfferStudy, initialOfferStudy, offerStudySchema, type OfferLab, type OfferResult } from './offer-lab';
import { limitLeadCapture } from './growth-funnel-server';
import { getGrowth, saveGrowth } from './growth-server';
import { offerBriefChanges } from './offer-launch-brief';
import { csvCell } from './growth-funnel';

export async function getOfferLab(productId: string, owner: string): Promise<OfferLab> {
  const product = await ownedProduct(productId, owner), db = database(),growth=await getGrowth(productId,owner),sharedBrief={brief:growth.brief,updatedAt:growth.updatedAt};
  const row = await db.prepare('SELECT * FROM offer_experiments WHERE product_id=? AND owner=?').bind(productId, owner).first();
  if (!row) return { draft: initialOfferStudy(growth.productFacts?.title||String(product.title), String(product.audience),growth.brief,growth.productFacts), slug: '', status: 'draft', revision: 0, publishedRevision: null, published: null, visitors: 0, responseCount: 0, totalResponses: 0, preferenceCounts: { a: 0, b: 0, neither: 0 }, responses: [],sharedBrief };
  const responses = await db.prepare('SELECT * FROM offer_responses WHERE product_id=? AND owner=? ORDER BY created_at DESC,id DESC LIMIT 20').bind(productId, owner).all();
  const totals = await db.prepare('SELECT revision,preference,COUNT(*) AS count FROM offer_responses WHERE product_id=? AND owner=? GROUP BY revision,preference').bind(productId, owner).all();
  const currentTotals = totals.results.filter(r => Number(r.revision) === Number(row.published_revision));
  const preferenceCounts = { a: 0, b: 0, neither: 0 };
  for (const total of currentTotals) preferenceCounts[total.preference as 'a'|'b'|'neither'] = Number(total.count);
  const visitors = await db.prepare('SELECT COUNT(*) n FROM offer_visitors WHERE product_id=? AND owner=? AND revision=?').bind(productId, owner, row.published_revision ?? 0).first();
  return { draft: offerStudySchema.parse(JSON.parse(String(row.draft))), sharedBrief,slug: String(row.slug), status: row.status as OfferLab['status'], revision: Number(row.revision),
    publishedRevision: row.published_revision == null ? null : Number(row.published_revision), published: row.published ? offerStudySchema.parse(JSON.parse(String(row.published))) : null,
    visitors: Number(visitors?.n ?? 0), responseCount: currentTotals.reduce((n, r) => n + Number(r.count), 0), totalResponses: totals.results.reduce((n, r) => n + Number(r.count), 0), preferenceCounts, responses: responses.results.map(r => ({ id: String(r.id), revision: Number(r.revision), preference: r.preference as OfferResult['preference'], readiness: String(r.readiness), feedback: String(r.feedback), email: r.email == null ? null : String(r.email), createdAt: Number(r.created_at) })) };
}
const changeSchema = z.object({ expectedRevision: z.number().int().min(0), action: z.enum(['save','publish','close','apply']), draft: offerStudySchema.optional(), variant: z.enum(['a','b']).optional(), expectedGrowthUpdatedAt: z.number().int().min(0).optional() });
export async function changeOfferLab(productId: string, owner: string, input: unknown) {
  await ownedProduct(productId, owner);
  const value = changeSchema.parse(input), current = await getOfferLab(productId, owner), db = database();
  if (current.revision !== value.expectedRevision) throw new ApiError('This offer changed in another tab. Reload before saving.', 409);
  if (value.action === 'apply') {
    if (!value.variant || value.expectedGrowthUpdatedAt === undefined) throw new ApiError('Choose a saved offer and current brief.');
    const selected = current.draft[value.variant];
    if (!completeOfferStudy({ ...current.draft, a: selected, b: selected })) throw new ApiError('Complete the selected offer first.');
    const growth = await getGrowth(productId, owner);
    await saveGrowth(productId, owner, { expectedUpdatedAt: value.expectedGrowthUpdatedAt, assets: growth.assets, brief: { ...growth.brief, ...offerBriefChanges(current.draft,value.variant,growth.brief) } });
    return current;
  }
  const draft = value.draft || current.draft;
  if (value.action === 'publish' && !completeOfferStudy(draft)) throw new ApiError('Complete both offers before sharing the survey.');
  if (value.action === 'close' && !current.published) throw new ApiError('This survey has not been published.');
  const revision = current.revision + 1, now = Date.now();
  // Republishing a changed study creates a new comparison round. Responses to
  // earlier prices and promises stay attached to their original snapshot.
  const newRound = value.action === 'publish' && JSON.stringify(current.published) !== JSON.stringify(draft);
  const publishedRevision = newRound ? revision : current.publishedRevision;
  const published = value.action === 'publish' ? draft : current.published;
  const status = value.action === 'publish' ? 'live' : value.action === 'close' ? 'closed' : current.status;
  const update = db.prepare(`INSERT INTO offer_experiments (product_id,owner,slug,draft,published,status,revision,published_revision,published_at,updated_at)
    SELECT ?,?,?,?,?,?,?,?,?,? WHERE ?=0 OR EXISTS(SELECT 1 FROM offer_experiments WHERE product_id=? AND owner=?)
    ON CONFLICT(product_id) DO UPDATE SET draft=excluded.draft,published=excluded.published,status=excluded.status,revision=excluded.revision,published_revision=excluded.published_revision,published_at=excluded.published_at,updated_at=excluded.updated_at
    WHERE offer_experiments.owner=excluded.owner AND offer_experiments.revision=?`)
    .bind(productId, owner, current.slug || `offer-${crypto.randomUUID()}`, JSON.stringify(draft), published ? JSON.stringify(published) : null, status, revision, publishedRevision, published ? now : null, now, value.expectedRevision, productId, owner, value.expectedRevision);
  const statements = [update];
  if (current.published && current.publishedRevision != null) statements.push(db.prepare('INSERT OR IGNORE INTO offer_rounds (id,product_id,owner,revision,study,created_at) VALUES (?,?,?,?,?,?)').bind(`${productId}:${current.publishedRevision}`, productId, owner, current.publishedRevision, JSON.stringify(current.published), now));
  if (newRound) statements.push(db.prepare(`INSERT OR IGNORE INTO offer_rounds (id,product_id,owner,revision,study,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM offer_experiments WHERE product_id=? AND owner=? AND revision=? AND published_revision=? AND published=?)`).bind(`${productId}:${revision}`, productId, owner, revision, JSON.stringify(draft), now, productId, owner, revision, revision, JSON.stringify(draft)));
  const [result] = await db.batch(statements);
  if (!result.meta.changes) throw new ApiError('This offer changed in another tab. Reload before saving.', 409);
  return getOfferLab(productId, owner);
}

export async function exportOfferResponses(productId: string, owner: string) {
  await ownedProduct(productId, owner);
  const columns = ['Round', 'Question', 'Problem', 'Offer A', 'A audience', 'A outcome', 'A includes', 'A price', 'A currency', 'Offer B', 'B audience', 'B outcome', 'B includes', 'B price', 'B currency', 'Preference', 'Interest', 'Feedback', 'Email', 'Date'];
  const encoder = new TextEncoder(); let cursorDate = -1, cursorId = '', ended = false;
  // Each pull reads a bounded page. Keyset pagination keeps memory bounded and
  // avoids dropping rows when new responses arrive during a long export.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(encoder.encode('\uFEFF' + columns.map(csvCell).join(',') + '\r\n')); },
    async pull(controller) {
      if (ended) return;
      try {
        const rows = await database().prepare(`SELECT r.*,COALESCE(round.study,CASE WHEN e.published_revision=r.revision THEN e.published ELSE NULL END) AS round_study
          FROM offer_responses r LEFT JOIN offer_rounds round ON round.product_id=r.product_id AND round.owner=r.owner AND round.revision=r.revision
          LEFT JOIN offer_experiments e ON e.product_id=r.product_id AND e.owner=r.owner
          WHERE r.product_id=? AND r.owner=? AND (r.created_at>? OR (r.created_at=? AND r.id>?)) ORDER BY r.created_at,r.id LIMIT 1000`).bind(productId, owner, cursorDate, cursorDate, cursorId).all();
        const lines = rows.results.map(row => {
          const study = row.round_study ? offerStudySchema.parse(JSON.parse(String(row.round_study))) : null;
          const variant = (key: 'a'|'b') => study ? [study[key].title, study[key].audience, study[key].outcome, study[key].includes, study[key].price, study[key].currency] : ['Snapshot unavailable', '', '', '', '', ''];
          return [row.revision, study?.question || '', study?.problem || '', ...variant('a'), ...variant('b'), row.preference, row.readiness, row.feedback, row.email || '', new Date(Number(row.created_at)).toISOString()].map(csvCell).join(',');
        });
        if (lines.length) controller.enqueue(encoder.encode(lines.join('\r\n') + '\r\n'));
        if (rows.results.length < 1000) { ended = true; controller.close(); return; }
        const last = rows.results.at(-1)!; cursorDate = Number(last.created_at); cursorId = String(last.id);
      } catch (error) { ended = true; controller.error(error); }
    },
    cancel() { ended = true; },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="offer-feedback.csv"', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' } });
}
export async function publicOfferStudy(slug: string) {
  const row = await database().prepare("SELECT e.* FROM offer_experiments e JOIN products p ON p.id=e.product_id AND p.owner=e.owner WHERE e.slug=? AND p.archived_at IS NULL AND e.status='live' AND e.published IS NOT NULL").bind(slug).first();
  if (!row) throw new ApiError('This offer survey is unavailable.', 404);
  return { productId: String(row.product_id), owner: String(row.owner), slug: String(row.slug), revision: Number(row.published_revision), study: (()=>{const study=offerStudySchema.parse(JSON.parse(String(row.published)));return {question:study.question,problem:study.problem,a:study.a,b:study.b};})() };
}
const responseSchema = z.object({ slug: z.string().max(120), revision: z.number().int().positive(), visitor: z.string().uuid(), action: z.enum(['visit','respond']), preference: z.enum(['a','b','neither']).optional(), readiness: z.enum(['curious','interested','ready']).optional(), feedback: z.string().trim().max(2000).default(''), email: z.union([z.literal(''),z.string().trim().email().max(254)]).default(''), website: z.string().max(300).default('') });
export async function respondToOffer(input: unknown) {
  const value = responseSchema.parse(input), study = await publicOfferStudy(value.slug), db = database();
  if (study.revision !== value.revision) throw new ApiError('The offer changed. Reload this survey before responding.', 409);
  if (value.website) return { success: true };
  await limitLeadCapture(`offer:${study.productId}`, value.visitor);
  await db.prepare(`INSERT OR IGNORE INTO offer_visitors (id,product_id,owner,revision,visitor,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM offer_experiments WHERE product_id=? AND status='live' AND published_revision=?)`)
    .bind(crypto.randomUUID(), study.productId, study.owner, study.revision, value.visitor, Date.now(), study.productId, value.revision).run();
  if (value.action === 'respond') {
    if (!value.preference || !value.readiness) throw new ApiError('Choose an offer and tell us how interested you are.');
    const result = await db.prepare(`INSERT OR IGNORE INTO offer_responses (id,product_id,owner,revision,visitor,preference,readiness,feedback,email,created_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM offer_experiments WHERE product_id=? AND status='live' AND published_revision=?)`)
      .bind(crypto.randomUUID(), study.productId, study.owner, study.revision, value.visitor, value.preference, value.readiness, value.feedback, value.email ? value.email.toLowerCase() : null, Date.now(), study.productId, value.revision).run();
    if (!result.meta.changes) throw new ApiError('A response was already received, or this survey has closed.', 409);
  }
  return { success: true };
}

export async function offerBriefPreview(productId:string,owner:string,variant:'a'|'b'){const [lab,growth]=await Promise.all([getOfferLab(productId,owner),getGrowth(productId,owner)]),changes=offerBriefChanges(lab.draft,variant,growth.brief);return {variant,expectedRevision:lab.revision,expectedGrowthUpdatedAt:growth.updatedAt,source:JSON.stringify(lab.draft)===JSON.stringify(lab.published)?`Published survey round ${lab.publishedRevision}`:'Saved research draft · not a published survey result',responseCount:lab.responseCount,fields:Object.entries(changes).map(([field,after])=>({field,before:growth.brief[field as keyof typeof growth.brief],after})),retained:['Creator story','Evidence and claim limits','Tone','Call to action','Existing VSL and page draft','Live checkout price','Published pages','Active email snapshots']};}
