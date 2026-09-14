import {failure,identity,sameOrigin} from '@/lib/server';
import {walletPortal} from '@/lib/wallet-billing';
export async function POST(req:Request) {
  try {sameOrigin(req);const user=await identity();return Response.json(await walletPortal(user.userId,new URL(req.url).origin),{headers:{'Cache-Control':'no-store'}});}
  catch(error){return failure(error);}
}
