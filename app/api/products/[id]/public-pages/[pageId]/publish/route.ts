import {failure,identity,sameOrigin} from '@/lib/server';
import {publishPublicPage} from '@/lib/public-pages-server';
type Context={params:Promise<{id:string;pageId:string}>};
async function handle(request:Request,context:Context,remove=false){try{sameOrigin(request);const u=await identity(),p=await context.params;return Response.json({page:await publishPublicPage(p.id,u.userId,p.pageId,await request.json(),remove)},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return failure(e);}}
export const POST=(request:Request,context:Context)=>handle(request,context);
export const DELETE=(request:Request,context:Context)=>handle(request,context,true);
