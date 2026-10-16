import { z } from 'zod';
import { failure,identity,sameOrigin } from '@/lib/server';
import { cancelCreatorBooking } from '@/lib/commerce-v2-server';
export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);const user=await identity(),{id}=await params,{bookingId}=z.object({bookingId:z.string().uuid()}).parse(await req.json());return Response.json(await cancelCreatorBooking(user.userId,id,bookingId));}catch(error){return failure(error);}}
