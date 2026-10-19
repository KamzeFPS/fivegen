import { ApiError, database, productFromRow } from "./server";
import { calculateQuote, defaultCommerce, type Commerce, type OfferProduct } from "./commerce";
import { planFor } from "./billing";
export async function quoteProduct(slug:string,quantity=1,code="",addUpsell=false){
  const row=await database().prepare("SELECT p.*,s.stripe_account FROM products p LEFT JOIN sellers s ON p.owner=s.owner WHERE p.slug=? AND p.status='published'").bind(slug).first();
  if(!row)throw new ApiError("This product is unavailable.",404);
  if(await database().prepare('SELECT product_id FROM product_builder_workspaces WHERE product_id=?').bind(row.id).first())throw new ApiError('Open this product’s published page to review its current offer. Purchases use the secure product checkout.',409);
  const product=productFromRow(row),plan=await planFor(String(row.owner));
  const stored=product.commerce||defaultCommerce();
  const commerce=stored;
  const related:OfferProduct[]=[];
  for(const id of new Set([commerce.deal.productId,commerce.upsell.productId].filter(Boolean))){
    const p=await database().prepare("SELECT * FROM products WHERE id=? AND owner=? AND status='published'").bind(id,row.owner).first();
    if(p && p.id!==product.id&&!await database().prepare('SELECT product_id FROM product_builder_workspaces WHERE product_id=?').bind(p.id).first()){const item=productFromRow(p);if(item.commerce?.billing==="once")related.push(item);}
  }
  try { return {row,commerce,plan,quote:calculateQuote(product,commerce,related,quantity,code,addUpsell)}; }
  catch(e){throw new ApiError((e as Error).message,409);}
}
export async function validateRelated(owner:string,id:string,c:Commerce){
  const ids=[...new Set([...( ["bogo","bonus","bundle"].includes(c.deal.type)?[c.deal.productId]:[]),...(c.upsell.enabled?[c.upsell.productId]:[])])];
  for(const relatedId of ids){
    if(relatedId===id)throw new ApiError("Choose a different product for a bonus, bundle, or upsell.");
    const p=await database().prepare("SELECT * FROM products WHERE id=? AND owner=? AND status='published'").bind(relatedId,owner).first();
    if(!p||productFromRow(p).commerce?.billing!=="once")throw new ApiError("Included products and upsells must be your published, one-time products.");
  }
  if(c.upsell.enabled&&["bogo","bonus","bundle"].includes(c.deal.type)&&c.deal.productId===c.upsell.productId)throw new ApiError("Your upsell must differ from the product already included in the deal.");
}
