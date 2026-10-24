import {binding,failure} from '@/lib/server';
import {dispatchServiceIntegrations} from '@/lib/service-integrations-server';
export async function POST(req:Request){const secret=binding('PRODUCT_REMINDER_DISPATCH_SECRET');if(secret.length<32||req.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({error:'Unauthorized.'},{status:401});try{return Response.json(await dispatchServiceIntegrations(),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
