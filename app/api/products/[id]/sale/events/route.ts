import {z} from 'zod';
import {ApiError,failure,identity,ownedProduct,sameOrigin} from '@/lib/server';
import {fileSaleEvent,fileSaleHeaders} from '@/lib/file-sales';
const clientEvents=new Set(['draft_resumed','preview_opened','sales_link_copied','payment_setup_returned']);
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);const user=await identity(),{id}=await params;await ownedProduct(id,user.userId);const data=z.object({event:z.string(),eventId:z.string().uuid(),detail:z.record(z.unknown()).optional()}).parse(await req.json());if(!clientEvents.has(data.event))throw new ApiError('This event is recorded by the server.');const recorded=await fileSaleEvent(id,user.userId,data.event,data.detail,`${id}:${data.eventId}`);return Response.json({recorded},{headers:fileSaleHeaders});}catch(e){return failure(e);}}
