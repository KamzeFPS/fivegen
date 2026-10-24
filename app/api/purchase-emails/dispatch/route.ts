import {binding,failure} from '@/lib/server';
import {dispatchPurchaseEmails} from '@/lib/purchase-email';
const headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
export async function POST(request:Request){
  const secret=binding('PURCHASE_EMAIL_DISPATCH_SECRET');
  if(secret.length<32||request.headers.get('authorization')!==`Bearer ${secret}`)return Response.json({error:'Unauthorized.'},{status:401,headers});
  try{return Response.json(await dispatchPurchaseEmails(2),{headers});}catch(error){return failure(error);}
}
