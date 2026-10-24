import { failure,sameOrigin } from '@/lib/server';
import { createCommerceCheckout } from '@/lib/commerce-v2-server';
import {createStudioCheckout} from '@/lib/product-studio-commerce';
import {associateCheckoutJourney} from '@/lib/journey-server';
export async function POST(req:Request){try{sameOrigin(req);const raw=await req.json(),privateMode=req.headers.get('dnt')==='1'||req.headers.get('sec-gpc')==='1',input=privateMode&&raw&&typeof raw==='object'&&!Array.isArray(raw)?{...raw,journeySession:undefined,campaign:''}:raw,{cookie,...result}=await createStudioCheckout(req,input)||await createCommerceCheckout(req,input);if(result.orderId&&!privateMode)await associateCheckoutJourney(input,result.orderId).catch(()=>{});return Response.json(result,{headers:{'Cache-Control':'private, no-store',...(cookie?{'Set-Cookie':cookie}:{})}});}catch(error){return failure(error);}}
