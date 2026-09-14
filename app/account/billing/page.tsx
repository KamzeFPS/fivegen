import type {Metadata} from 'next';
import {requireChatGPTUser} from '@/app/chatgpt-auth';
import {binding} from '@/lib/server';
import {paddleAccount} from '@/lib/paddle/account';
import {walletAccount} from '@/lib/wallet-billing';
import {WalletBillingAccount} from './wallet-billing-account';
import '../../pricing/pricing.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Billing & receipts — FiveGen'};
export default async function BillingPage(){
  const user=await requireChatGPTUser('/account/billing');
  const [account,previous]=await Promise.all([
    ['live','test'].includes(binding('STRIPE_MODE'))?walletAccount(user.userId):null,
    ['production','sandbox'].includes(binding('PADDLE_ENVIRONMENT'))?paddleAccount(user.userId):null,
  ]);
  return <WalletBillingAccount email={user.email} account={account} previous={previous}/>;
}
