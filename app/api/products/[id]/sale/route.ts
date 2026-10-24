import {failure,identity,sameOrigin} from '@/lib/server';
import {getFileSale,saveFileSale,fileSaleHeaders} from '@/lib/file-sales';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{const user=await identity(),{id}=await params;return Response.json(await getFileSale(id,user.userId),{headers:fileSaleHeaders});}catch(e){return failure(e);}}
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);const user=await identity(),{id}=await params;return Response.json(await saveFileSale(id,user.userId,await req.json()),{headers:fileSaleHeaders});}catch(e){return failure(e);}}
