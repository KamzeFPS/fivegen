import {failure} from '@/lib/server';
import {publicPageMedia} from '@/lib/public-pages-server';
export async function GET(request:Request,{params}:{params:Promise<{pageId:string;kind:string}>}){try{const p=await params;return await publicPageMedia(request,p.pageId,p.kind);}catch(e){return failure(e);}}
