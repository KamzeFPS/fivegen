import {z} from 'zod';
import {failure,identity,sameOrigin} from '@/lib/server';
import {walletReceipt} from '@/lib/wallet-billing';

export async function POST(req:Request){
  try{sameOrigin(req);const user=await identity({allowUnaccepted:true}),body=z.object({paymentId:z.string().min(1).max(200)}).strict().parse(await req.json());return Response.json(await walletReceipt(user.userId,body.paymentId),{headers:{'Cache-Control':'no-store'}});}
  catch(error){return failure(error);}
}
