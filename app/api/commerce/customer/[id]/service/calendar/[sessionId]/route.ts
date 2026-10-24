import {failure} from '@/lib/server';
import {serviceCalendar} from '@/lib/product-service-server';
export async function GET(req:Request,{params}:{params:Promise<{id:string;sessionId:string}>}){try{const {id,sessionId}=await params;return await serviceCalendar(req,id,sessionId);}catch(error){return failure(error);}}
