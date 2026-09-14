import {ApiError,binding,failure} from '@/lib/server';
import {walletStripe} from '@/lib/wallet-stripe';
import {handleWalletEvent} from '@/lib/wallet-billing';
export async function POST(req:Request) {
  try {
    const secret=binding('STRIPE_WALLET_WEBHOOK_SECRET');
    if(!secret.startsWith('whsec_'))throw new ApiError('Wallet webhook is not configured.',503);
    const raw=await req.text();let event;
    try {event=await walletStripe().webhooks.constructEventAsync(raw,req.headers.get('stripe-signature')||'',secret);}
    catch {throw new ApiError('Invalid webhook signature.',400);}
    await handleWalletEvent(event);
    return Response.json({received:true});
  }catch(error){return failure(error);}
}
