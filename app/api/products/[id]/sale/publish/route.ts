import {failure,identity,sameOrigin} from '@/lib/server';
import {publishFileSale,fileSaleHeaders} from '@/lib/file-sales';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);const user=await identity(),{id}=await params;return Response.json(await publishFileSale(id,user.userId,await req.json()),{headers:fileSaleHeaders});}catch(e){return failure(e);}}
