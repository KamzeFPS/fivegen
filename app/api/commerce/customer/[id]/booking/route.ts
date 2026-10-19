import { failure,sameOrigin } from '@/lib/server';
import { bookCommerceSlot,cancelCommerceBooking } from '@/lib/commerce-v2-server';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);const {id}=await params;return Response.json(await bookCommerceSlot(req,id,await req.json()));}catch(error){return failure(error);}}
export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);const {id}=await params;return Response.json(await cancelCommerceBooking(req,id));}catch(error){return failure(error);}}
