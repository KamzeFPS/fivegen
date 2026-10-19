import { database, failure, identity, productFromRow } from '@/lib/server';
import { providerSettings } from '@/lib/ai';
import { isAdmin } from '@/lib/admin';
import { creditBalance } from '@/lib/credits';
import { textCredits } from '@/lib/credit-policy';
export async function GET() {
  try {
    const user=await identity();
    const [products,ai,credits,fileSales]=await Promise.all([
      database().prepare('SELECT * FROM products WHERE owner=? ORDER BY updated_at DESC').bind(user.userId).all(),
      providerSettings(),creditBalance(user.userId),database().prepare('SELECT d.product_id AS productId,d.data FROM file_sale_drafts d JOIN products p ON p.id=d.product_id WHERE p.owner=?').bind(user.userId).all(),
    ]);
    const summaries=new Map(fileSales.results.map(row=>[String(row.productId),JSON.parse(String(row.data)) as {title:string;description:string}]));
    return Response.json({admin:isAdmin(user),products:products.results.map(row=>{const product=productFromRow(row),draft=summaries.get(product.id);return draft?{...product,title:draft.title||product.title,description:draft.description}:product;}),fileSales:fileSales.results.map(row=>({productId:row.productId})),credits,textCost:textCredits(ai.config.textProvider),capabilities:{ai:ai.connected[ai.config.textProvider]&&!ai.config.paused,media:ai.connected.fal&&!ai.config.paused}});
  }catch(error){return failure(error);}
}
