import {ApiError,database,failure,productFromRow} from '@/lib/server';
import {productAccess} from '@/lib/access';
import {productBundle} from '@/lib/bundle';
export async function GET(_req:Request,{params}:{params:Promise<{slug:string}>}){try{const {slug}=await params,p=await database().prepare('SELECT * FROM products WHERE slug=?').bind(slug).first();if(!p)throw new ApiError('Product not found.',404);await productAccess(p,undefined,true);const product=productFromRow(p);const bytes=productBundle(product,false);return new Response(bytes as BodyInit,{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="${slug}.zip"`,'Cache-Control':'private, no-store'}});}catch(e){return failure(e);}}
