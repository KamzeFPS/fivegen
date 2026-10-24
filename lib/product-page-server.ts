import { env } from 'cloudflare:workers';
import { z } from 'zod';
import {applicationConfigIssues} from './service-applications';
import { ApiError, database, identity, ownedProduct } from './server';
import { customerOrder } from './commerce-v2-server';
import { publicCommerceOffer } from './commerce-v2-server';
import { publicFreeStudioOffer } from './product-studio-commerce';
import {getPublishedFileSale} from './file-sales';
import type {ProductStudioConfig} from './product-studio-contract';
import { builderDraftSchema, builderTypeDetails } from './builder-contract';
import { saleDraftSchema } from './file-sale-contract';
import {
  defaultProductPageConfig, productPageConfigSchema, productPageSaveSchema, productPageRevisionSchema, productReviewSchema,
  type ProductPageConfig, type ProductPageState, type PublicProductPage, type PublicProductSummary, type ProductReviewSummary, type LandingCommerce,
} from './product-page';

const sectionSummarySchema = z.object({ title: z.string().max(150), category: z.string().max(80).optional() });
export const publicProductSchema = z.object({
  id: z.string(), slug: z.string().max(100), title: z.string().max(100), description: z.string().max(12000),
  format: z.string().max(200), sections: z.array(sectionSummarySchema).max(30),
  priceCents: z.number().int().min(0).max(999900).default(0), currency: z.string().regex(/^[a-z]{3}$/).default('usd'), benefits: z.array(z.string().max(600)).max(12).default([]),
});
const imageMimes = ['image/jpeg', 'image/png', 'image/webp'];
const imageMaxBytes = 10 * 1024 * 1024;
const eligibleImage = "id=? AND product_id=? AND owner=? AND status='completed' AND mime IN ('image/jpeg','image/png','image/webp') AND size BETWEEN 1 AND 10485760 AND object_key NOT LIKE 'voice/%' AND NOT EXISTS (SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)";
const emptyReviews = (): ProductReviewSummary => ({ count: 0, average: null, reviews: [] });
function pagePath(slug: string) { return `/product/${encodeURIComponent(slug)}`; }

export async function snapshotProduct(product: Record<string, unknown>) {
  // Deliberately project individual public fields. Never spread private content,
  // even when a future lesson or product schema adds more fields.
  const builder = await database().prepare('SELECT version,data FROM product_builder_workspaces WHERE product_id=? AND owner=?').bind(product.id, product.owner).first();
  const sale = !builder ? await database().prepare('SELECT version,data FROM file_sale_drafts WHERE product_id=?').bind(product.id).first() : null;
  const builderDraft = builder ? builderDraftSchema.parse(JSON.parse(String(builder.data))) : null;
  const saleDraft = sale ? saleDraftSchema.parse(JSON.parse(String(sale.data))) : null;
  const content = builderDraft || (saleDraft ? { sections: saleDraft.modules.filter(module => module.included && module.kind === 'course').flatMap(module => module.sections) } : z.object({ sections: z.array(sectionSummarySchema).max(30) }).parse(JSON.parse(String(product.content))));
  const snapshot = publicProductSchema.parse({
    id: String(product.id), slug: String(product.slug), title: builderDraft?.title ?? saleDraft?.title ?? String(product.title),
    description: builderDraft?.description ?? saleDraft?.description ?? String(product.description),
    format: builderDraft ? builderTypeDetails[builderDraft.type].format : String(product.format),
    priceCents: builderDraft?.priceCents ?? saleDraft?.priceCents ?? Number(product.price || 0), currency: builderDraft?.currency ?? saleDraft?.currency ?? 'usd',
    benefits: z.object({ benefits: z.array(z.string().max(600)).max(12).default([]) }).passthrough().parse(JSON.parse(String(product.content))).benefits,
    sections: content.sections.map(section => ({ title: section.title, ...(section.category ? { category: section.category } : {}) })),
  });
  return {
    snapshot,
    guardSql: builder ? ' AND EXISTS(SELECT 1 FROM product_builder_workspaces WHERE product_id=? AND owner=? AND version=? AND data=?)'
      : sale ? ' AND EXISTS(SELECT 1 FROM file_sale_drafts WHERE product_id=? AND version=? AND data=?) AND NOT EXISTS(SELECT 1 FROM product_builder_workspaces WHERE product_id=?)'
      : ' AND NOT EXISTS(SELECT 1 FROM product_builder_workspaces WHERE product_id=?) AND NOT EXISTS(SELECT 1 FROM file_sale_drafts WHERE product_id=?)',
    guardValues: builder ? [product.id, product.owner, builder.version, builder.data]
      : sale ? [product.id, sale.version, sale.data, product.id] : [product.id, product.id],
  };
}

export async function assertPageImages(productId: string, owner: string, config: ProductPageConfig) {
  for (const id of new Set([config.iconUploadId, config.bannerUploadId, ...config.sections.map(section => section.imageUploadId)].filter((value): value is string => !!value))) {
    const row = await database().prepare(`SELECT * FROM uploads WHERE ${eligibleImage}`).bind(id, productId, owner).first();
    if (!row) throw new ApiError('Choose a completed JPEG, PNG, or WebP uploaded to this product, up to 10 MB. Voice Library files stay private.', 409);
    const object = await (env as unknown as { BUCKET?: R2Bucket }).BUCKET?.get(String(row.object_key), { range: { offset: 0, length: Math.min(16, Number(row.size)) } });
    if (!object) throw new ApiError('This image is unavailable. Upload it again before saving your product page.', 409);
    const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
    const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
    const valid = row.mime === 'image/jpeg' ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : row.mime === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
      : row.mime === 'image/webp' && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    if (!valid) throw new ApiError('The image contents do not match its JPEG, PNG, or WebP file type. Upload a valid image.', 400);
  }
}

export const eligiblePageVideo="id=? AND product_id=? AND owner=? AND status='completed' AND mime IN ('video/mp4','video/webm') AND size BETWEEN 12 AND 1073741824 AND object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)";
export async function assertPageRecordings(productId:string,owner:string,config:ProductPageConfig){
 for(const id of new Set(config.sections.map(s=>s.videoUploadId).filter((id):id is string=>!!id))){
  const row=await database().prepare('SELECT * FROM uploads WHERE '+eligiblePageVideo).bind(id,productId,owner).first();
  if(!row)throw new ApiError('Choose a completed MP4 or WebM recording uploaded to this product. Creator Library recordings remain private.',409);
  const object=await (env as unknown as {BUCKET?:R2Bucket}).BUCKET?.get(String(row.object_key),{range:{offset:0,length:16}});
  if(!object)throw new ApiError('This recording is unavailable. Upload the original before publishing.',409);
  const bytes=new Uint8Array(await new Response(object.body).arrayBuffer()),valid=row.mime==='video/mp4'?String.fromCharCode(...bytes.slice(4,8))==='ftyp':[26,69,223,163].every((b,i)=>bytes[i]===b);
  if(!valid)throw new ApiError('This recording does not match its MP4 or WebM format. Upload a valid video.',400);
 }
}

export function imageGuard(config: ProductPageConfig, productId: string, owner: string) {
  const videoIds=Array.from(new Set(config.sections.map(s=>s.videoUploadId).filter((id):id is string=>!!id)));
  const ids = Array.from(new Set([config.iconUploadId, config.bannerUploadId, ...config.sections.map(section => section.imageUploadId)].filter((id): id is string => !!id)));
  return {
    sql: (ids.length ? ` AND ${ids.map(() => `EXISTS(SELECT 1 FROM uploads WHERE ${eligibleImage})`).join(' AND ')}` : '')+(videoIds.length?` AND ${videoIds.map(()=>`EXISTS(SELECT 1 FROM uploads WHERE ${eligiblePageVideo})`).join(' AND ')}`:''),
    values: [...ids.flatMap(id => [id, productId, owner]),...videoIds.flatMap(id=>[id,productId,owner])],
  };
}

export async function reviewSummary(productId: string, owner: string): Promise<ProductReviewSummary> {
  // Refunded, disputed, test, zero-value and removed purchases never contribute
  // to the public rating, including after the review was originally written.
  const eligible = "r.product_id=? AND r.owner=? AND o.id=r.order_id AND o.product_id=r.product_id AND o.owner=r.owner AND o.email=r.email AND o.mode='live' AND o.status='paid' AND o.amount>0 AND o.paid_at IS NOT NULL";
  const summary = await database().prepare(`SELECT COUNT(*) AS count,AVG(r.rating) AS average FROM product_reviews r JOIN commerce_orders o ON o.id=r.order_id WHERE ${eligible}`).bind(productId, owner).first();
  const rows = await database().prepare(`SELECT r.id,r.display_name,r.rating,r.body,r.created_at FROM product_reviews r JOIN commerce_orders o ON o.id=r.order_id WHERE ${eligible} ORDER BY r.created_at DESC,r.id DESC LIMIT 100`).bind(productId, owner).all();
  return {
    count: Number(summary?.count || 0), average: summary?.average == null ? null : Number(summary.average),
    reviews: rows.results.map(row => ({ id: String(row.id), displayName: String(row.display_name), rating: Number(row.rating), body: String(row.body), createdAt: Number(row.created_at) })),
  };
}

export async function pageCommerce(productId:string, owner:string, product:PublicProductSummary):Promise<LandingCommerce> {
  const builder = await database().prepare('SELECT slug,version,public_snapshot FROM product_builder_publications WHERE product_id=? AND owner=?').bind(productId,owner).first();
  if (builder) {
    const shown=JSON.parse(String(builder.public_snapshot)) as {priceCents?:number;currency?:string;studio?:ProductStudioConfig};
    const freeOffer=await publicFreeStudioOffer(String(builder.slug)),paidOffer=await publicCommerceOffer(String(builder.slug)),offer=freeOffer||paidOffer;
    const tiers=shown.studio?.community?.tiers,amount=tiers?.length?Math.min(...tiers.map(tier=>tier.priceCents)):Number(shown.priceCents??product.priceCents??0);
    // Read only the published pricing presentation, never the delivery snapshot.
    return {amount,currency:shown.currency??product.currency??'usd',enabled:!!offer,paidReady:!!paidOffer,path:offer?`/b/${encodeURIComponent(String(builder.slug))}`:null,...(offer?{mode:offer.mode as 'test'|'live'}:{}),model:shown.studio?.pricing?.model??'one-time',interval:shown.studio?.pricing?.interval,publicationVersion:Number(builder.version),...(offer?{checkout:{slug:String(builder.slug),pricing:shown.studio?.pricing,tiers:shown.studio?.community?.tiers,physical:shown.studio?.custom?.requiresShipping===true}}:{})};
  }
  const draft=await database().prepare('SELECT product_id FROM product_builder_workspaces WHERE product_id=? AND owner=?').bind(productId,owner).first();
  if (draft) return {amount:product.priceCents??0,currency:product.currency??'usd',enabled:false,path:null};
  const file=await database().prepare('SELECT product_id FROM file_sale_drafts WHERE product_id=?').bind(productId).first();
  if(file){const sale=await getPublishedFileSale(product.slug);return {amount:product.priceCents??0,currency:product.currency??'usd',enabled:!!sale?.readiness.ready,path:sale?.readiness.ready?`/p/${encodeURIComponent(product.slug)}`:null};}
  const funnel=await database().prepare('SELECT slug FROM growth_funnels WHERE product_id=? AND owner=? AND published_at IS NOT NULL').bind(productId,owner).first();
  const offer=funnel?await publicCommerceOffer(String(funnel.slug)):null;
  return {amount:offer?.amount??product.priceCents??0,currency:offer?.currency??product.currency??'usd',enabled:!!offer,paidReady:!!offer,model:'one-time',...(offer&&funnel?{checkout:{slug:String(funnel.slug)}}:{}),path:offer&&funnel?`/g/${encodeURIComponent(String(funnel.slug))}`:null,...(offer?{mode:offer.mode as 'test'|'live'}:{})};
}

export async function getProductPage(productId: string, owner: string): Promise<ProductPageState> {
  const product = await ownedProduct(productId, owner);
  const row = await database().prepare('SELECT * FROM product_pages WHERE product_id=? AND owner=?').bind(productId, owner).first();
  return {
    id:productId,purpose:'sales',name:'Sales page',
    draft: row ? productPageConfigSchema.parse(JSON.parse(String(row.draft))) : defaultProductPageConfig(String(product.format)),
    published: row?.published_at != null && row.published ? productPageConfigSchema.parse(JSON.parse(String(row.published))) : null,
    publishedAt: row?.published_at == null ? null : Number(row.published_at), updatedAt: Number(row?.updated_at || 0),
    publicPath: pagePath(String(product.slug)), reviewSummary: await reviewSummary(productId, owner),
    commerce: await pageCommerce(productId,owner,(await snapshotProduct(product)).snapshot),
  };
}

export async function saveProductPage(productId: string, owner: string, input: unknown, operationGuard: {sql: string; values: unknown[]} = {sql: '', values: []}) {
  await ownedProduct(productId, owner);
  const value = productPageSaveSchema.parse(input);
  await assertPageImages(productId, owner, value.config);
  await assertPageRecordings(productId,owner,value.config);
  const now = Math.max(Date.now(), value.expectedUpdatedAt + 1), guard = imageGuard(value.config, productId, owner);
  guard.sql += operationGuard.sql ? ` AND (${operationGuard.sql})` : '';
  guard.values.push(...operationGuard.values as string[]);
  const result = value.expectedUpdatedAt === 0
    ? await database().prepare(`INSERT OR IGNORE INTO product_pages (product_id,owner,draft,updated_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM products WHERE id=? AND owner=?)${guard.sql}`)
      .bind(productId, owner, JSON.stringify(value.config), now, productId, owner, ...guard.values).run()
    : await database().prepare(`UPDATE product_pages SET draft=?,updated_at=? WHERE product_id=? AND owner=? AND updated_at=?${guard.sql}`)
      .bind(JSON.stringify(value.config), now, productId, owner, value.expectedUpdatedAt, ...guard.values).run();
  if (!result.meta.changes) throw new ApiError('Your product page or its images changed. Reload before saving.', 409);
  await database().prepare('INSERT INTO product_page_revisions(id,product_id,owner,config,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(), productId, owner, JSON.stringify(value.config), now).run();
  return getProductPage(productId, owner);
}

export async function publishProductPage(productId: string, owner: string, input: unknown) {
  const { expectedUpdatedAt } = productPageRevisionSchema.parse(input), product = await ownedProduct(productId, owner);
  const page = await getProductPage(productId, owner);
  if (page.updatedAt !== expectedUpdatedAt) throw new ApiError('Your product page changed in another tab. Reload before publishing.', 409);
  if (page.draft.templateId !== 'classic' && !page.draft.sections.some(section => section.type === 'hero' && section.enabled)) throw new ApiError('Enable a hero section before publishing your sales page.', 409);
  if(page.draft.ctaMode==='form'&&!page.draft.sections.some(s=>s.enabled&&((s.type==='lead-form'&&s.leadForm)||(s.type==='application'&&s.application))))throw new ApiError('Add and enable a signup or application form before publishing.',409);
  if (page.draft.ctaMode === 'link' && !page.draft.ctaUrl) throw new ApiError('Add the HTTPS destination for your custom button before publishing.', 409);
  for(const s of page.draft.sections.filter(s=>s.enabled&&s.type==='application'&&s.application)){const issues=applicationConfigIssues(s.application!);if(issues.length)throw new ApiError(issues[0],409);}
  await assertPageImages(productId, owner, page.draft);
  await assertPageRecordings(productId,owner,page.draft);
  const publicProduct = await snapshotProduct(product), now = Math.max(Date.now(), expectedUpdatedAt + 1), guard = imageGuard(page.draft, productId, owner);
  const unchangedProduct = 'EXISTS(SELECT 1 FROM products WHERE id=? AND owner=? AND updated_at=?)' + publicProduct.guardSql;
  const productGuardValues = [productId, owner, product.updated_at, ...publicProduct.guardValues];
  const result = expectedUpdatedAt === 0
    ? await database().prepare(`INSERT OR IGNORE INTO product_pages (product_id,owner,draft,published,public_product,published_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE ${unchangedProduct}${guard.sql}`)
      .bind(productId, owner, JSON.stringify(page.draft), JSON.stringify(page.draft), JSON.stringify(publicProduct.snapshot), now, now, ...productGuardValues, ...guard.values).run()
    : await database().prepare(`UPDATE product_pages SET published=draft,public_product=?,published_at=?,updated_at=? WHERE product_id=? AND owner=? AND updated_at=? AND ${unchangedProduct}${guard.sql}`)
      .bind(JSON.stringify(publicProduct.snapshot), now, now, productId, owner, expectedUpdatedAt, ...productGuardValues, ...guard.values).run();
  if (!result.meta.changes) throw new ApiError('Your product or page changed. Reload before publishing.', 409);
  return getProductPage(productId, owner);
}

export async function unpublishProductPage(productId: string, owner: string, input: unknown) {
  const { expectedUpdatedAt } = productPageRevisionSchema.parse(input);
  await ownedProduct(productId, owner);
  const result = await database().prepare('UPDATE product_pages SET published=NULL,public_product=NULL,published_at=NULL,updated_at=? WHERE product_id=? AND owner=? AND updated_at=?')
    .bind(Math.max(Date.now(), expectedUpdatedAt + 1), productId, owner, expectedUpdatedAt).run();
  if (!result.meta.changes) throw new ApiError('Your product page changed. Reload before removing the public page.', 409);
  return getProductPage(productId, owner);
}

async function publishedPage(slug: string) {
  const row = await database().prepare('SELECT pp.*,p.slug FROM product_pages pp JOIN products p ON p.id=pp.product_id AND p.owner=pp.owner WHERE p.slug=? AND pp.published_at IS NOT NULL AND pp.published IS NOT NULL AND pp.public_product IS NOT NULL').bind(slug).first();
  if (!row) throw new ApiError('This product page is unavailable.', 404);
  return row;
}

export async function getPublicProductPage(slug: string): Promise<PublicProductPage> {
  const row = await publishedPage(slug), config = productPageConfigSchema.parse(JSON.parse(String(row.published)));
  const product = publicProductSchema.parse(JSON.parse(String(row.public_product)));
  const builder = await database().prepare('SELECT slug,version,public_snapshot FROM product_builder_publications WHERE product_id=? AND owner=?').bind(row.product_id, row.owner).first();
  const builderDraft = !builder ? await database().prepare('SELECT product_id FROM product_builder_workspaces WHERE product_id=? AND owner=?').bind(row.product_id, row.owner).first() : null;
  const fileDraft = !builder && !builderDraft ? await database().prepare('SELECT product_id,published_revision_id FROM file_sale_drafts WHERE product_id=?').bind(row.product_id).first() : null;
  const fileSale = fileDraft?.published_revision_id ? await database().prepare('SELECT id FROM file_sale_revisions WHERE id=? AND product_id=?').bind(fileDraft.published_revision_id, row.product_id).first() : null;
  const funnel = !builder && !builderDraft && !fileDraft ? await database().prepare('SELECT slug FROM growth_funnels WHERE product_id=? AND owner=? AND published_at IS NOT NULL').bind(row.product_id, row.owner).first() : null;
  return {
    pageId:String(row.product_id),pagePurpose:'sales',
    product: { ...product, sections: config.showContent ? product.sections : [] },
    config: { ...config, sections:config.sections.filter(section=>section.enabled && (section.type!=='curriculum'||config.showContent) && (section.type!=='reviews'||config.showReviews) && (section.type!=='creator'||config.showCreator)), creatorName: config.showCreator ? config.creatorName : '', about:config.showCreator?config.about:'', location: config.showLocation ? config.location : '' },
    publishedAt: Number(row.published_at), publicPath: pagePath(String(row.slug)),
    funnelPath: builder ? `/b/${encodeURIComponent(String(builder.slug))}` : fileSale ? `/p/${encodeURIComponent(String(row.slug))}` : funnel ? `/g/${encodeURIComponent(String(funnel.slug))}` : null,
    commerce: await pageCommerce(String(row.product_id),String(row.owner),product),
    reviewSummary: config.showReviews ? await reviewSummary(String(row.product_id), String(row.owner)) : emptyReviews(),
  };
}

export async function productPageImage(slug: string, kind: string) {
  if (kind !== 'icon' && kind !== 'banner' && !/^section-[a-zA-Z0-9_-]{1,80}$/.test(kind)) throw new ApiError('Image not found.', 404);
  const page = await publishedPage(slug), config = productPageConfigSchema.parse(JSON.parse(String(page.published)));
  const id = kind === 'icon' ? config.iconUploadId : kind === 'banner' ? config.bannerUploadId : config.sections.find(section => section.enabled && (section.type!=='creator'||config.showCreator) && (section.type!=='curriculum'||config.showContent) && (section.type!=='reviews'||config.showReviews) && `section-${section.id}` === kind)?.imageUploadId;
  if (!id) throw new ApiError('Image not found.', 404);
  const file = await database().prepare(`SELECT * FROM uploads WHERE ${eligibleImage}`).bind(id, page.product_id, page.owner).first();
  if (!file || !imageMimes.includes(String(file.mime)) || Number(file.size) > imageMaxBytes) throw new ApiError('Image not found.', 404);
  const object = await (env as unknown as { BUCKET?: R2Bucket }).BUCKET?.get(String(file.object_key));
  if (!object) throw new ApiError('Image unavailable.', 404);
  return new Response(object.body, { headers: {
    'Content-Type': String(file.mime), 'Content-Length': String(file.size),
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  } });
}

export async function getPublicProductReviews(slug: string) {
  const page = await publishedPage(slug), config = productPageConfigSchema.parse(JSON.parse(String(page.published)));
  if (!config.showReviews) throw new ApiError('Reviews are not available for this product page.', 404);
  return reviewSummary(String(page.product_id), String(page.owner));
}

export async function addProductReview(request: Request, slug: string, input: unknown) {
  const value = productReviewSchema.parse(input), page = await publishedPage(slug);
  const config = productPageConfigSchema.parse(JSON.parse(String(page.published)));
  if (!config.showReviews) throw new ApiError('Reviews are not available for this product page.', 404);
  const order = await customerOrder(request, value.orderId, true, { purchaserOnly: true });
  if (order.product_id !== page.product_id || order.owner !== page.owner || order.mode !== 'live' || order.status !== 'paid' || Number(order.amount) <= 0 || order.paid_at == null)
    throw new ApiError('Only a confirmed live purchase of this product can leave a review.', 403);
  const user = await identity({ allowUnaccepted: true }).catch(() => null);
  const email = String(order.email).trim().toLowerCase();
  const ownEmail = await database().prepare('SELECT id FROM terms_acceptances WHERE owner=? AND LOWER(email)=? LIMIT 1').bind(page.owner, email).first();
  if (user?.userId === page.owner || ownEmail) throw new ApiError('Creators cannot review their own products.', 403);
  const result = await database().prepare(`INSERT OR IGNORE INTO product_reviews (id,product_id,owner,order_id,email,display_name,rating,body,created_at)
    SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM commerce_orders WHERE id=? AND product_id=? AND owner=? AND email=? AND mode='live' AND status='paid' AND amount>0 AND paid_at IS NOT NULL)
    AND EXISTS(SELECT 1 FROM product_pages WHERE product_id=? AND owner=? AND published_at IS NOT NULL AND json_extract(published,'$.showReviews')=1)`)
    .bind(crypto.randomUUID(), page.product_id, page.owner, value.orderId, email, value.displayName, value.rating, value.body, Date.now(), value.orderId, page.product_id, page.owner, email, page.product_id, page.owner).run();
  if (!result.meta.changes) {
    const existing = await database().prepare('SELECT id FROM product_reviews WHERE order_id=? OR (product_id=? AND email=?) LIMIT 1').bind(value.orderId, page.product_id, email).first();
    if (existing) throw new ApiError('You have already reviewed this product.', 409);
    throw new ApiError('The purchase or product page is no longer available for a review.', 403);
  }
  return getPublicProductReviews(slug);
}
