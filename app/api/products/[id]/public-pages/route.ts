import {failure,identity,sameOrigin} from '@/lib/server';
import {createPublicPage,listPublicPages} from '@/lib/public-pages-server';
const headers={'Cache-Control':'private, no-store'};
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{const user=await identity();return Response.json({pages:await listPublicPages((await params).id,user.userId)},{headers});}catch(e){return failure(e);}}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(request);const user=await identity();return Response.json({page:await createPublicPage((await params).id,user.userId,await request.json())},{headers});}catch(e){return failure(e);}}
