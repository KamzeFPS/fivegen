import {failure,identity,database} from '@/lib/server';
import {getOwnedPublicPage} from '@/lib/public-pages-server';
import {getPageRevisions} from '@/lib/page-template-server';
import {productPageConfigSchema} from '@/lib/product-page';
export async function GET(_request:Request,{params}:{params:Promise<{id:string;pageId:string}>}){try{const u=await identity(),p=await params;await getOwnedPublicPage(p.id,u.userId,p.pageId);const revisions=p.id===p.pageId?await getPageRevisions(p.id,u.userId):(await database().prepare('SELECT id,config,created_at FROM public_page_revisions WHERE page_id=? AND product_id=? AND owner=? ORDER BY created_at DESC LIMIT 30').bind(p.pageId,p.id,u.userId).all()).results.map(r=>({id:String(r.id),config:productPageConfigSchema.parse(JSON.parse(String(r.config))),createdAt:Number(r.created_at)}));return Response.json({revisions},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return failure(e);}}
