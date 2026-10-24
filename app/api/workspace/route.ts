import { database, failure, identity, productFromRow } from '@/lib/server';
import { providerSettings } from '@/lib/ai';
import { isAdmin } from '@/lib/admin';
import { creditBalance } from '@/lib/credits';
import { textCredits } from '@/lib/credit-policy';
import type {ProductContent} from '@/lib/product';
export async function GET() {
  try {
    const user=await identity();
    const [products,ai,credits,fileSales,builders]=await Promise.all([
      database().prepare("SELECT p.*,u.id AS page_icon_upload_id FROM products p LEFT JOIN product_pages pp ON pp.product_id=p.id AND pp.owner=p.owner LEFT JOIN uploads u ON u.id=json_extract(pp.draft,'$.iconUploadId') AND u.owner=p.owner AND u.product_id=p.id AND u.status='completed' AND u.mime IN ('image/png','image/jpeg','image/webp') AND u.object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources v WHERE v.upload_id=u.id) WHERE p.owner=? ORDER BY p.updated_at DESC").bind(user.userId).all(),
      providerSettings(),creditBalance(user.userId),database().prepare("SELECT d.product_id AS productId,d.data,d.published_revision_id AS publishedRevisionId,u.id AS coverId FROM file_sale_drafts d JOIN products p ON p.id=d.product_id LEFT JOIN uploads u ON u.id=json_extract(d.data,'$.coverUploadId') AND u.owner=p.owner AND u.product_id=p.id AND u.status='completed' AND u.mime IN ('image/png','image/jpeg','image/webp') AND u.object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources v WHERE v.upload_id=u.id) WHERE p.owner=?").bind(user.userId).all(),
      database().prepare("SELECT w.product_id AS productId,json_extract(w.data,'$.type') AS type,json_array_length(w.data,'$.sections') AS unitCount,json_array_length(w.data,'$.uploadIds') AS uploadCount,EXISTS(SELECT 1 FROM product_builder_publications p WHERE p.product_id=w.product_id) AS pagePublished,u.id AS coverId FROM product_builder_workspaces w LEFT JOIN uploads u ON u.id=json_extract(w.data,'$.coverUploadId') AND u.owner=w.owner AND u.product_id=w.product_id AND u.status='completed' AND u.mime IN ('image/png','image/jpeg','image/webp') AND u.object_key NOT LIKE 'voice/%' AND NOT EXISTS(SELECT 1 FROM creator_voice_sources v WHERE v.upload_id=u.id) WHERE w.owner=?").bind(user.userId).all(),
    ]);
    const summaries=new Map(fileSales.results.map(row=>[String(row.productId),JSON.parse(String(row.data)) as {title:string;description:string;modules?:{kind:string;sections?:ProductContent['sections']}[]}]));
    return Response.json({admin:isAdmin(user),products:products.results.map(row=>{const product=productFromRow(row),draft=summaries.get(product.id);return draft?{...product,title:draft.title||product.title,description:draft.description,content:{...product.content,sections:draft.modules?.find(module=>module.kind==='course')?.sections||[],files:[]}}:product;}),fileSales:fileSales.results.map(row=>({productId:row.productId,pagePublished:!!row.publishedRevisionId,...(row.coverId?{coverUrl:'/api/uploads/'+encodeURIComponent(String(row.coverId))}:{})})),builders:builders.results.map(row=>({productId:String(row.productId),type:String(row.type),unitCount:Number(row.unitCount),uploadCount:Number(row.uploadCount),pagePublished:!!row.pagePublished,...(row.coverId?{coverUrl:'/api/uploads/'+encodeURIComponent(String(row.coverId))}:{})})),credits,textCost:textCredits(ai.config.textProvider),capabilities:{ai:ai.connected[ai.config.textProvider]&&!ai.config.paused,media:ai.connected.fal&&!ai.config.paused}},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return failure(error);}
}
