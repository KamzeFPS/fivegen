import { failure,sameOrigin } from '@/lib/server';
import { createCommerceCheckout } from '@/lib/commerce-v2-server';
export async function POST(req:Request){try{sameOrigin(req);const {cookie,...result}=await createCommerceCheckout(req,await req.json());return Response.json(result,{headers:{'Cache-Control':'private, no-store',...(cookie?{'Set-Cookie':cookie}:{})}});}catch(error){return failure(error);}}
