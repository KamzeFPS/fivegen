import {failure,identity,sameOrigin} from '@/lib/server';
import {reviewServiceApplication} from '@/lib/service-applications-server';
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);const user=await identity();return Response.json(await reviewServiceApplication(user.userId,(await params).id,await req.json()),{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});}catch(error){return failure(error);}}
