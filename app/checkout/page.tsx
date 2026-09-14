import {redirect} from 'next/navigation';
import {requireChatGPTUser} from '../chatgpt-auth';
import {walletCatalog} from '@/lib/wallet-catalog';
import {walletPublicConfig} from '@/lib/wallet-stripe';
import {WalletCheckout} from './wallet-checkout';
import '../pricing/pricing.css';
export const dynamic='force-dynamic';
export default async function CheckoutPage({searchParams}:{searchParams:Promise<{offer?:string}>}) {
  const query=await searchParams,offer=walletCatalog().find(o=>o.id===query.offer);
  if(!offer)redirect('/pricing');
  const user=await requireChatGPTUser(`/checkout?offer=${encodeURIComponent(offer.id)}`),config=walletPublicConfig();
  return <WalletCheckout config={config} offer={offer} email={user.email}/>;
}
