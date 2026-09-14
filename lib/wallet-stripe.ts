import Stripe from 'stripe';
import { ApiError, binding } from './server';

export function walletEnvironment(): 'production'|'sandbox' {
  const mode=binding('STRIPE_MODE');
  if(mode!=='live'&&mode!=='test')throw new ApiError('Wallet checkout requires an explicit Stripe mode.',503);
  return mode==='live'?'production':'sandbox';
}
export function walletStripe() {
  const environment=walletEnvironment(),key=binding('STRIPE_SECRET_KEY');
  if(!new RegExp(`^(sk|rk)_${environment==='production'?'live':'test'}_`).test(key))throw new ApiError('Wallet checkout keys do not match the selected environment.',503);
  return new Stripe(key,{maxNetworkRetries:2,timeout:20000});
}
export function walletPublicConfig() {
  try {
    const environment=walletEnvironment(),publishableKey=binding('STRIPE_PUBLISHABLE_KEY');
    walletStripe();
    if(!publishableKey.startsWith(environment==='production'?'pk_live_':'pk_test_'))throw new Error('Missing public key');
    const enabled=binding('STRIPE_WALLET_CHECKOUT_ENABLED')==='true'&&binding('STRIPE_WALLET_WEBHOOK_SECRET').startsWith('whsec_')&&Boolean(binding('STRIPE_WALLET_PORTAL_CONFIGURATION'));
    return {environment,publishableKey,enabled};
  } catch { return null; }
}
export function assertWalletCheckout() {
  const config=walletPublicConfig();
  if(!config?.enabled)throw new ApiError('Apple Pay and Google Pay checkout is being set up. Please try again later.',503);
  return config;
}
export function walletObjectId(object:string|{id:string}|null|undefined) { return typeof object==='string'?object:object?.id??null; }
