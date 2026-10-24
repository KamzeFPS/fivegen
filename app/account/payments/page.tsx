import type {Metadata} from 'next';
import {requireChatGPTUser} from '@/app/chatgpt-auth';
import {commerceAccount} from '@/lib/commerce-v2-server';
import {SellerPaymentsAccount} from './seller-payments-account';
import '../../pricing/pricing.css';
import './payments.css';

export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Seller payments — FiveGen'};

export default async function SellerPaymentsPage(){
  const user=await requireChatGPTUser('/account/payments');
  const account=await commerceAccount(user.userId);
  return <SellerPaymentsAccount email={user.email} initialAccount={{...account,ready:Boolean(account.ready)}}/>;
}
