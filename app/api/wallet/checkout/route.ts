import {ApiError,database,failure,identity,sameOrigin} from '@/lib/server';
import {createWalletCheckout,closeWalletCheckout,fulfillWalletSession,walletAccount} from '@/lib/wallet-billing';
import {walletEnvironment} from '@/lib/wallet-stripe';
import {z} from 'zod';
export async function POST(req:Request) {
  try {
    sameOrigin(req);const user=await identity(),body=z.object({action:z.enum(['close']).optional(),offerId:z.string().max(100).optional(),sessionId:z.string().max(200).optional()}).parse(await req.json());
    if(body.action==='close')return Response.json(await closeWalletCheckout(user.userId,String(body.sessionId)));
    return Response.json(await createWalletCheckout(user.userId,user.email,String(body.offerId),new URL(req.url).origin),{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
export async function GET(req:Request) {
  try {
    const user=await identity(),sessionId=new URL(req.url).searchParams.get('session_id');
    if(!sessionId||!/^cs_(test|live)_[a-zA-Z0-9]+$/.test(sessionId))throw new ApiError('Invalid checkout reference.');
    const owned=await database().prepare('SELECT id FROM wallet_checkout_intents WHERE owner=? AND environment=? AND session_id=?').bind(user.userId,walletEnvironment(),sessionId).first();
    if(!owned)throw new ApiError('Checkout not found.',404);
    await fulfillWalletSession(sessionId);
    const account=await walletAccount(user.userId);
    const intent=await database().prepare('SELECT status,credits,billing_interval FROM wallet_checkout_intents WHERE owner=? AND session_id=?').bind(user.userId,sessionId).first<{status:string;credits:number;billing_interval:string|null}>();
    return Response.json({...account,checkoutComplete:intent?.status==='complete',purchaseCredits:intent?.credits,monthly:Boolean(intent?.billing_interval)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return failure(error);}
}
