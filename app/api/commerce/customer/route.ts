import { failure } from '@/lib/server';
import { customerLibraryStatus } from '@/lib/commerce-v2-server';
export async function GET(req:Request){try{return Response.json(await customerLibraryStatus(req,new URL(req.url).searchParams.get('order')||undefined),{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});}catch(error){return failure(error);}}
