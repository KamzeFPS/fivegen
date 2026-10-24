import {failure,identity} from '@/lib/server';
import {ownerServiceApplications} from '@/lib/service-applications-server';
export async function GET(req:Request){try{const user=await identity(),params=new URL(req.url).searchParams;return Response.json(await ownerServiceApplications(user.userId,params.get('product')||'',params.get('person')||'',params.get('status')||''),{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});}catch(error){return failure(error);}}
