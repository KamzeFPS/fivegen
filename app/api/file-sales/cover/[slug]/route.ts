import {env} from 'cloudflare:workers';
import {ApiError,database,failure} from '@/lib/server';
import {fileSalesEnabled} from '@/lib/file-sales';
import {saleDraftSchema} from '@/lib/file-sale-contract';
export async function GET(_req:Request,{params}:{params:Promise<{slug:string}>}){try{
 if(!fileSalesEnabled())throw new ApiError('This sales page is unavailable.',404);
 const row=await database().prepare("SELECT r.snapshot,p.id,p.owner FROM products p JOIN file_sale_drafts d ON d.product_id=p.id JOIN file_sale_revisions r ON r.id=d.published_revision_id WHERE p.slug=? AND p.status='published'").bind((await params).slug).first();
 if(!row)throw new ApiError('Cover not found.',404);
 const snapshot=saleDraftSchema.parse(JSON.parse(String(row.snapshot)));
 const cover=snapshot.coverUploadId?await database().prepare("SELECT * FROM uploads WHERE id=? AND product_id=? AND owner=? AND status='completed'").bind(snapshot.coverUploadId,row.id,row.owner).first():null;
 if(!cover||!['image/jpeg','image/png','image/webp'].includes(String(cover.mime)))throw new ApiError('Cover not found.',404);
 const object=await (env as unknown as {BUCKET:R2Bucket}).BUCKET.get(String(cover.object_key));if(!object)throw new ApiError('Cover unavailable.',404);
 return new Response(object.body,{headers:{'Content-Type':String(cover.mime),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}catch(e){return failure(e);}}
