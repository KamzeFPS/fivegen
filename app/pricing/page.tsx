import type {Metadata} from 'next';
import {getChatGPTUser} from '../chatgpt-auth';
import {walletPublicConfig} from '@/lib/wallet-stripe';
import {walletCatalog} from '@/lib/wallet-catalog';
import {Pricing} from './pricing';
import './pricing.css';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Plans & AI Credits — FiveGen',description:'Monthly or annual plans and one-time AI credit packs. Pay with Apple Pay or Google Pay.'};
export default async function PricingPage() {
  const user=await getChatGPTUser();
  return <Pricing config={walletPublicConfig()} offers={walletCatalog()} email={user?.email}/>;
}
