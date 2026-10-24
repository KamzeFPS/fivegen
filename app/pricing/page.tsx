import type {Metadata} from 'next';
import {getChatGPTUser} from '../chatgpt-auth';
import {walletPublicConfig} from '@/lib/wallet-stripe';
import {walletCatalog} from '@/lib/wallet-catalog';
import {creatorPlan} from '@/lib/creator-plan-server';
import {Pricing} from './pricing';
import './pricing.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Creator Plans & AI Credits — FiveGen',description:'Start free, choose Creator Pro for $29/month or Scale for $99/month, and keep more from each product sale. Stripe processing is additional.'};
export default async function PricingPage() {
  const user=await getChatGPTUser();
  const config=walletPublicConfig(),currentPlan=user&&config?await creatorPlan(user.userId,config.environment==='production'?'live':'test'):undefined;
  return <Pricing config={config} offers={walletCatalog()} email={user?.email} currentPlan={currentPlan}/>;
}
