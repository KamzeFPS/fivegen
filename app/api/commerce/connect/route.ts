import { z } from 'zod';
import { failure, identity, sameOrigin } from '@/lib/server';
import { commerceAccount,connectCommerce } from '@/lib/commerce-v2-server';
export async function GET(){try{const user=await identity();return Response.json(await commerceAccount(user.userId,true),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
export async function POST(req:Request){try{sameOrigin(req);const user=await identity(),value=z.object({country:z.string().regex(/^[A-Z]{2}$/),productId:z.string().uuid().optional()}).parse(await req.json());return Response.json(await connectCommerce(user.userId,user.email,new URL(req.url).origin,value.country,value.productId));}catch(error){return failure(error);}}
