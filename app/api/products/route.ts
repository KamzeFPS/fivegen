import { briefSchema, emptyContent, slugify } from '@/lib/product';
import { ApiError, database, failure, identity, productFromRow, sameOrigin } from '@/lib/server';
import { briefFromPlan, studioPlanSchema } from '@/lib/studio-plan';
import { emptyGrowthBrief } from '@/lib/growth';
import { z } from 'zod';
export async function POST(req:Request) {
  try {
    sameOrigin(req); const user=await identity(),db=database();
    const raw=await req.json() as Record<string,unknown>;
    const conversationId=raw.conversationId===undefined?null:z.string().uuid().parse(raw.conversationId);
    const conversation=conversationId?await db.prepare('SELECT * FROM studio_conversations WHERE id=? AND owner=?').bind(conversationId,user.userId).first():null;
    if(conversationId&&!conversation)throw new ApiError('Conversation not found.',404);
    if(conversation?.product_id){const row=await db.prepare('SELECT * FROM products WHERE id=? AND owner=?').bind(conversation.product_id,user.userId).first();if(!row)throw new ApiError('Your product could not be found.',409);return Response.json({product:productFromRow(row),mode:'manual'});}
    if(conversation&&(!conversation.plan||Number(conversation.lease)>Date.now()||conversation.updated_at!==raw.expectedUpdatedAt))throw new ApiError('The plan changed or is still being created. Refresh it before continuing.',409);
    const plan=conversation?studioPlanSchema.parse(JSON.parse(String(conversation.plan))):null;
    const input=briefSchema.extend({price:z.literal(0).default(0),generationMode:z.enum(['auto','manual']).default('manual')}).parse(plan?{...briefFromPlan(plan),generationMode:'manual'}:raw);
    const brief=briefSchema.parse(input);
    const id=conversationId||crypto.randomUUID(),now=Date.now(),slug=slugify(brief.title)+'-'+id.slice(0,6);
    const statements=[db.prepare(`INSERT OR IGNORE INTO products (id,owner,slug,title,description,audience,format,price,color,content,status,created_at,updated_at)
      SELECT ?,?,?,?,?,?,?,0,?,?,'draft',?,? WHERE ? IS NULL OR EXISTS(SELECT 1 FROM studio_conversations WHERE id=? AND owner=? AND product_id IS NULL AND lease<? AND updated_at=?)`)
      .bind(id,user.userId,slug,brief.title,brief.description,brief.audience,brief.format,brief.color,JSON.stringify(emptyContent(brief)),now,now,conversationId,conversationId,user.userId,now,raw.expectedUpdatedAt??0)];
    // The creator authors the teaching content. AI works on the growth brief
    // and copy only; creating a workspace never queues course generation.
    statements.push(db.prepare('INSERT OR IGNORE INTO growth_workspaces (product_id,owner,brief,updated_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM products WHERE id=? AND owner=?)')
      .bind(id,user.userId,JSON.stringify(plan?.growthBrief||emptyGrowthBrief(brief.audience)),now,id,user.userId));
    if(conversationId)statements.push(db.prepare('UPDATE studio_conversations SET product_id=? WHERE id=? AND owner=? AND EXISTS(SELECT 1 FROM products WHERE id=? AND owner=?)').bind(id,conversationId,user.userId,id,user.userId));
    await db.batch(statements);
    const row=await db.prepare('SELECT * FROM products WHERE id=? AND owner=?').bind(id,user.userId).first();
    if(!row)throw new ApiError('Your plan changed. Refresh it before creating the product.',409);
    return Response.json({product:productFromRow(row),mode:'manual'});
  }catch(error){return failure(error);}
}
