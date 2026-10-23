import {failure,identity} from '@/lib/server';
import {serviceProvider,completeServiceAuthorization} from '@/lib/service-integrations-oauth';
export async function GET(req:Request,{params}:{params:Promise<{provider:string}>}){try{const user=await identity(),result=await completeServiceAuthorization(req,user.userId,serviceProvider((await params).provider));return new Response(null,{status:303,headers:{Location:result.location,'Set-Cookie':result.cookie,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});}catch(error){return failure(error);}}
