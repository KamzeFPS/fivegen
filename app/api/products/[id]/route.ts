import { z } from 'zod';
import { briefSchema, contentSchema } from '@/lib/product';
import { ApiError, database, failure, identity, ownedProduct, productFromRow, sameOrigin } from '@/lib/server';
const updateSchema = briefSchema.extend({content:contentSchema,expectedUpdatedAt:z.number().int(),status:z.literal('draft').optional()});
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    sameOrigin(req); const user=await identity(),{id}=await params;
    const current=productFromRow(await ownedProduct(id,user.userId));
    const raw=await req.json() as Record<string,unknown>;
    if(raw.status==='published'||raw.commerce!==undefined||raw.experience!==undefined) throw new ApiError('FiveGen is a private creation studio. Storefronts, selling and publishing are no longer available.',410);
    const data=updateSchema.parse(raw);
    const job=await database().prepare('SELECT status FROM generation WHERE product_id=?').bind(id).first();
    if(job&&job.status!=='completed')throw new ApiError('Finish or stop AI generation before saving edits.',409);
    for(const section of data.content.sections) if(section.videoId) {
      const upload=await database().prepare("SELECT id FROM uploads WHERE id=? AND product_id=? AND owner=? AND status='completed' AND mime LIKE 'video/%'").bind(section.videoId,id,user.userId).first();
      if(!upload)throw new ApiError('This recording does not belong to this product.',409);
    }
    // Historical commerce and payment records remain intact and inaccessible here.
    const result=await database().prepare('UPDATE products SET title=?,description=?,audience=?,format=?,color=?,content=?,updated_at=? WHERE id=? AND owner=? AND updated_at=?')
      .bind(data.title,data.description,data.audience,data.format,data.color,JSON.stringify(data.content),Math.max(Date.now(),current.updatedAt+1),id,user.userId,data.expectedUpdatedAt).run();
    if(!result.meta.changes)throw new ApiError('This product changed in another tab. Reload it before saving.',409);
    return Response.json({product:productFromRow(await ownedProduct(id,user.userId))});
  }catch(error){return failure(error);}
}
