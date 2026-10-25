import {ArrowLeft,CreditCard,Wallet} from 'lucide-react';
import {Brand} from '@/app/ui-brand';

export function AccountNavigation({active,backHref='/',backLabel='Back to workspace'}:{active:'payments'|'billing'|'catalog';backHref?:string;backLabel?:string}){
  return <header className="account-navigation">
    <div className="account-navigation-top"><a href="/" aria-label="FiveGen home"><Brand/></a><nav aria-label="Account settings"><a href="/account/payments" aria-current={active==='payments'?'page':undefined}><Wallet size={17}/>Seller payments</a><a href="/account/billing" aria-current={active==='billing'?'page':undefined}><CreditCard size={17}/>Plan & billing</a><a href="/account/catalog" aria-current={active==='catalog'?'page':undefined}>Brand & catalog</a></nav><a href={backHref} className="account-workspace-link"><ArrowLeft size={16}/>{backLabel}</a></div>
  </header>;
}
