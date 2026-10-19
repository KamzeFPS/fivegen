import {z} from 'zod';
import {ApiError,database,failure,sameOrigin,stripe} from '@/lib/server';
import {recordPayment} from '@/lib/payments';
import {fileSaleHeaders} from '@/lib/file-sales';
export async function POST(req:Request){try{
  sameOrigin(req);const {slug,sessionId}=z.object({slug:z.string().min(1).max(100),sessionId:z.string().regex(/^cs_test_[a-zA-Z0-9_]+$/)}).parse(await req.json());
  const intent=await database().prepare('SELECT i.* FROM checkout_intents i JOIN products p ON p.id=i.product_id WHERE i.session_id=? AND p.slug=? AND i.sale_revision_id IS NOT NULL').bind(sessionId,slug).first();
  if(!intent)throw new ApiError('This payment reference does not match this product.',403);
  let session:Record<string,any>;try{session=await stripe(`checkout/sessions/${sessionId}`,undefined,String(intent.account));}catch{throw new ApiError('Payment confirmation is temporarily unavailable. Keep this page and try again.',502);}
  const order=await recordPayment(session,String(intent.account));
  return Response.json({accessToken:String(order!.token)},{headers:fileSaleHeaders});
}catch(e){return failure(e);}}
