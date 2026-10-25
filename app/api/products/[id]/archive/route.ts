import {failure,identity,sameOrigin} from '@/lib/server';
import {getProductArchive,setProductArchive} from '@/lib/product-archive-server';
const headers={'Cache-Control':'private, no-store'};
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{const user=await identity(),{id}=await params;return Response.json(await getProductArchive(id,user.userId),{headers});}catch(error){return failure(error);}}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);const user=await identity(),{id}=await params;return Response.json(await setProductArchive(id,user.userId,await req.json()),{headers});}catch(error){return failure(error);}}
