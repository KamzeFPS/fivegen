import { database, failure, identity, productFromRow } from '@/lib/server';
import { providerSettings } from '@/lib/ai';
import { isAdmin } from '@/lib/admin';
import { creditBalance } from '@/lib/credits';
import { textCredits } from '@/lib/credit-policy';
export async function GET() {
  try {
    const user=await identity();
    const [products,ai,credits,fileSales,builders]=await Promise.all([
      database().prepare('SELECT * FROM products WHERE owner=? ORDER BY updated_at DESC').bind(user.userId).all(),
      providerSettings(),creditBalance(user.userId),database().prepare('SELECT d.product_id AS productId,d.data FROM file_sale_drafts d JOIN products p ON p.id=d.product_id WHERE p.owner=?').bind(user.userId).all(),
      database().prepare("SELECT w.product_id AS productId,json_extract(w.data,'$.type') AS type,json_array_length(w.data,'$.sections') AS unitCount,json_array_length(w.data,'$.uploadIds') AS uploadCount,EXISTS(SELECT 1 FROM product_builder_publications p WHERE p.product_id=w.product_id) AS pagePublished FROM product_builder_workspaces w WHERE w.owner=?").bind(user.userId).all(),
    ]);
    const summaries=new Map(fileSales.results.map(row=>[String(row.productId),JSON.parse(String(row.data)) as {title:string;description:string}]));
    return Response.json({admin:isAdmin(user),products:products.results.map(row=>{const product=productFromRow(row),draft=summaries.get(product.id);return draft?{...product,title:draft.title||product.title,description:draft.description}:product;}),fileSales:fileSales.results.map(row=>({productId:row.productId})),builders:builders.results.map(row=>({productId:String(row.productId),type:String(row.type),unitCount:Number(row.unitCount),uploadCount:Number(row.uploadCount),pagePublished:!!row.pagePublished})),credits,textCost:textCredits(ai.config.textProvider),capabilities:{ai:ai.connected[ai.config.textProvider]&&!ai.config.paused,media:ai.connected.fal&&!ai.config.paused}});
  }catch(error){return failure(error);}
}
