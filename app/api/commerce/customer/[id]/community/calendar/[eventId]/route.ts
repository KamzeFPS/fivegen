import {failure} from '@/lib/server';
import {communityEventCalendar} from '@/lib/product-community-server';
export async function GET(req:Request,{params}:{params:Promise<{id:string;eventId:string}>}){try{const {id,eventId}=await params;return await communityEventCalendar(req,id,eventId);}catch(error){return failure(error);}}
