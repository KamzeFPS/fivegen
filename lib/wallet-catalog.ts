import { creditPacks } from './credit-policy';
import { creatorSubscriptionPlans, subscriptionPlans, type BillingInterval } from './subscriptions';

export type WalletOffer = {
  id:string; name:string; description:string; features:string[]; credits:number;
  cents:number; price:string; interval?:BillingInterval; featured?:boolean; commissionBps?:number;
};
// The same server-owned catalog drives cards, checkout amounts and fulfillment.
function creditPackOffers():WalletOffer[] {
  const packs = [
    {id:'starter',description:'For your next idea and your first launch.'},
    {id:'studio',description:'For creators building their next chapter.',featured:true},
    {id:'scale',description:'Room for a full pipeline of ideas.'},
  ];
  return packs.map(pack=>{
      const price=creditPacks.find(p=>p.id===pack.id)!;
      return {id:`pack:${pack.id}`,name:`${price.credits.toLocaleString('en-US')} credits`,description:pack.description,featured:pack.featured,credits:price.credits,cents:price.cents,price:`$${(price.cents/100).toFixed(2)}`,features:[`${price.credits.toLocaleString('en-US')} AI credits`,'AI growth copy, images, and videos','Purchased credits never expire','A one-time top-up; does not change your selling plan']};
    });
}
export function walletCatalog():WalletOffer[] {
  return [
    ...creditPackOffers(),
    ...creatorSubscriptionPlans.map(plan=>({id:`subscription:${plan.id}:month`,name:plan.name,description:plan.description,featured:'featured' in plan&&plan.featured,credits:plan.credits,cents:plan.monthlyCents,price:`$${(plan.monthlyCents/100).toFixed(2)}`,interval:'month' as const,commissionBps:plan.commissionBps,features:[...plan.features]})),
  ];
}

// Retired offers remain recognizable for receipts, already-open checkout
// recovery and verified renewals. They must not appear in the new-sales list.
export function historicalWalletCatalog():WalletOffer[] {
  const current=walletCatalog();
  return [
    ...current,
    ...subscriptionPlans.flatMap(plan=>(['month','year'] as const).map(interval=>{
      const cents=interval==='month'?plan.monthlyCents:plan.annualCents;
      return {id:`subscription:${plan.id}:${interval}`,name:plan.name,description:plan.description,featured:'featured' in plan&&plan.featured,credits:plan.credits,cents,price:`$${(cents/100).toFixed(2)}`,interval,commissionBps:300,features:[...plan.features]};
    })).filter(offer=>!current.some(currentOffer=>currentOffer.id===offer.id)),
  ];
}
