import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { ApiError, database, identity, ownedProduct } from './server';
import { customerOrder } from './commerce-v2-server';
import {
  defaultProductPageConfig, productPageConfigSchema, productPageSaveSchema, productPageRevisionSchema, productReviewSchema,
  type ProductPageConfig, type ProductPageState, type PublicProductPage, type PublicProductSummary, type ProductReviewSummary,
} from './product-page';

const sectionSummarySchema = z.object({ title: z.string().max(150), category: z.string().max(80).optional() });
const publicProductSchema = z.object({
  id: z.string(), slug: z.string().max(100), title: z.string().max(100), description: z.string().max(12000),
  format: z.string().max(200), sections: z.array(sectionSummarySchema).max(30),
});
const imageMimes = ['image/jpeg', 'image/png', 'image/webp'];
const imageMaxBytes = 10 * 1024 * 1024;
const eligibleImage = "id=? AND product_id=? AND owner=? AND status='completed' AND mime IN ('image/jpeg','image/png','image/webp') AND size BETWEEN 1 AND 10485760 AND object_key NOT LIKE 'voice/%' AND NOT EXISTS (SELECT 1 FROM creator_voice_sources WHERE upload_id=uploads.id)";
const emptyReviews = (): ProductReviewSummary => ({ count: 0, average: null, reviews: [] });
function pagePath(slug: string) { return `/product/${encodeURIComponent(slug)}`; }

function snapshotProduct(product: Record<string, unknown>): PublicProductSummary {
  // Deliberately project individual public fields. Never spread private content,
  // even when a future lesson or product schema adds more fields.
  const content = z.object({ sections: z.array(sectionSummarySchema).max(30) }).parse(JSON.parse(String(product.content)));
  return publicProductSchema.parse({
    id: String(product.id), slug: String(product.slug), title: String(product.title),
    description: String(product.description), format: String(product.format),
    sections: content.sections.map(section => ({ title: section.title, ...(section.category ? { category: section.category } : {}) })),
  });
}

async function assertPageImages(productId: string, owner: string, config: ProductPageConfig) {
  for (const id of new Set([config.iconUploadId, config.bannerUploadId].filter((value): value is string => !!value))) {
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

function imageGuard(config: ProductPageConfig, productId: string, owner: string) {
  const ids = Array.from(new Set([config.iconUploadId, config.bannerUploadId].filter((id): id is string => !!id)));
  return {
    sql: ids.length ? ` AND ${ids.map(() => `EXISTS(SELECT 1 FROM uploads WHERE ${eligibleImage})`).join(' AND ')}` : '',
    values: ids.flatMap(id => [id, productId, owner]),
  };
}

async function reviewSummary(productId: string, owner: string): Promise<ProductReviewSummary> {
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

export async function getProductPage(productId: string, owner: string): Promise<ProductPageState> {
  const product = await ownedProduct(productId, owner);
  const row = await database().prepare('SELECT * FROM product_pages WHERE product_id=? AND owner=?').bind(productId, owner).first();
  return {
    draft: row ? productPageConfigSchema.parse(JSON.parse(String(row.draft))) : defaultProductPageConfig(),
    published: row?.published_at != null && row.published ? productPageConfigSchema.parse(JSON.parse(String(row.published))) : null,
    publishedAt: row?.published_at == null ? null : Number(row.published_at), updatedAt: Number(row?.updated_at || 0),
    publicPath: pagePath(String(product.slug)), reviewSummary: await reviewSummary(productId, owner),
  };
}

export async function saveProductPage(productId: string, owner: string, input: unknown) {
  await ownedProduct(productId, owner);
  const value = productPageSaveSchema.parse(input);
  await assertPageImages(productId, owner, value.config);
  const now = Math.max(Date.now(), value.expectedUpdatedAt + 1), guard = imageGuard(value.config, productId, owner);
  const result = value.expectedUpdatedAt === 0
    ? await database().prepare(`INSERT OR IGNORE INTO product_pages (product_id,owner,draft,updated_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM products WHERE id=? AND owner=?)${guard.sql}`)
      .bind(productId, owner, JSON.stringify(value.config), now, productId, owner, ...guard.values).run()
    : await database().prepare(`UPDATE product_pages SET draft=?,updated_at=? WHERE product_id=? AND owner=? AND updated_at=?${guard.sql}`)
      .bind(JSON.stringify(value.config), now, productId, owner, value.expectedUpdatedAt, ...guard.values).run();
  if (!result.meta.changes) throw new ApiError('Your product page or its images changed. Reload before saving.', 409);
  return getProductPage(productId, owner);
}

export async function publishProductPage(productId: string, owner: string, input: unknown) {
  const { expectedUpdatedAt } = productPageRevisionSchema.parse(input), product = await ownedProduct(productId, owner);
  const page = await getProductPage(productId, owner);
  if (page.updatedAt !== expectedUpdatedAt) throw new ApiError('Your product page changed in another tab. Reload before publishing.', 409);
  await assertPageImages(productId, owner, page.draft);
  const publicProduct = snapshotProduct(product), now = Math.max(Date.now(), expectedUpdatedAt + 1), guard = imageGuard(page.draft, productId, owner);
  const unchangedProduct = 'EXISTS(SELECT 1 FROM products WHERE id=? AND owner=? AND updated_at=?)';
  const result = expectedUpdatedAt === 0
    ? await database().prepare(`INSERT OR IGNORE INTO product_pages (product_id,owner,draft,published,public_product,published_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE ${unchangedProduct}${guard.sql}`)
      .bind(productId, owner, JSON.stringify(page.draft), JSON.stringify(page.draft), JSON.stringify(publicProduct), now, now, productId, owner, product.updated_at, ...guard.values).run()
    : await database().prepare(`UPDATE product_pages SET published=draft,public_product=?,published_at=?,updated_at=? WHERE product_id=? AND owner=? AND updated_at=? AND ${unchangedProduct}${guard.sql}`)
      .bind(JSON.stringify(publicProduct), now, now, productId, owner, expectedUpdatedAt, productId, owner, product.updated_at, ...guard.values).run();
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
  const funnel = await database().prepare('SELECT slug FROM growth_funnels WHERE product_id=? AND owner=? AND published_at IS NOT NULL').bind(row.product_id, row.owner).first();
  return {
    product: { ...product, sections: config.showContent ? product.sections : [] },
    config: { ...config, creatorName: config.showCreator ? config.creatorName : '', location: config.showLocation ? config.location : '' },
    publishedAt: Number(row.published_at), publicPath: pagePath(String(row.slug)),
    funnelPath: funnel ? `/g/${encodeURIComponent(String(funnel.slug))}` : null,
    reviewSummary: config.showReviews ? await reviewSummary(String(row.product_id), String(row.owner)) : emptyReviews(),
  };
}

export async function productPageImage(slug: string, kind: string) {
  if (kind !== 'icon' && kind !== 'banner') throw new ApiError('Image not found.', 404);
  const page = await publishedPage(slug), config = productPageConfigSchema.parse(JSON.parse(String(page.published)));
  const id = kind === 'icon' ? config.iconUploadId : config.bannerUploadId;
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
  const order = await customerOrder(request, value.orderId);
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
