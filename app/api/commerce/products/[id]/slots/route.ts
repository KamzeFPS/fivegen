import { z } from 'zod';
import { failure, identity, sameOrigin } from '@/lib/server';
import { addCommerceSlot,removeCommerceSlot } from '@/lib/commerce-v2-server';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);const user=await identity(),{id}=await params;return Response.json({slots:await addCommerceSlot(id,user.userId,await req.json())});}catch(error){return failure(error);}}
export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);const user=await identity(),{id}=await params,value=z.object({slotId:z.string().uuid()}).parse(await req.json());return Response.json({slots:await removeCommerceSlot(id,user.userId,value.slotId)});}catch(error){return failure(error);}}
