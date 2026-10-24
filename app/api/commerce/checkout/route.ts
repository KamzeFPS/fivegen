import { failure,sameOrigin } from '@/lib/server';
import { createCommerceCheckout } from '@/lib/commerce-v2-server';
import {createStudioCheckout} from '@/lib/product-studio-commerce';
export async function POST(req:Request){try{sameOrigin(req);const input=await req.json(),{cookie,...result}=await createStudioCheckout(req,input)||await createCommerceCheckout(req,input);return Response.json(result,{headers:{'Cache-Control':'private, no-store',...(cookie?{'Set-Cookie':cookie}:{})}});}catch(error){return failure(error);}}
