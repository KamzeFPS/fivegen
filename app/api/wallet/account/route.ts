import {failure,identity,sameOrigin} from '@/lib/server';
import {reconcileWalletAccount,walletAccount} from '@/lib/wallet-billing';

export async function GET(){
  try{const user=await identity({allowUnaccepted:true});return Response.json(await walletAccount(user.userId),{headers:{'Cache-Control':'no-store'}});}
  catch(error){return failure(error);}
}
export async function POST(req:Request){
  try{sameOrigin(req);const user=await identity({allowUnaccepted:true});return Response.json(await reconcileWalletAccount(user.userId),{headers:{'Cache-Control':'no-store'}});}
  catch(error){return failure(error);}
}
