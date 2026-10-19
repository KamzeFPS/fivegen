import { failure } from '@/lib/server';
import { customerProduct } from '@/lib/commerce-v2-server';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;return Response.json(await customerProduct(req,id),{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});}catch(error){return failure(error);}}
