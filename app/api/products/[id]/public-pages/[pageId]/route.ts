import {failure,identity,sameOrigin} from '@/lib/server';
import {getOwnedPublicPage,savePublicPage} from '@/lib/public-pages-server';
type Context={params:Promise<{id:string;pageId:string}>};const headers={'Cache-Control':'private, no-store'};
export async function GET(_request:Request,{params}:Context){try{const u=await identity(),p=await params;return Response.json({page:await getOwnedPublicPage(p.id,u.userId,p.pageId)},{headers});}catch(e){return failure(e);}}
export async function PATCH(request:Request,{params}:Context){try{sameOrigin(request);const u=await identity(),p=await params;return Response.json({page:await savePublicPage(p.id,u.userId,p.pageId,await request.json())},{headers});}catch(e){return failure(e);}}
