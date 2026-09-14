import { creditPacks } from './credit-policy';
import { subscriptionPlans, type BillingInterval } from './subscriptions';

export type WalletOffer = {
  id:string; name:string; description:string; features:string[]; credits:number;
  cents:number; price:string; interval?:BillingInterval; featured?:boolean;
};
// The same server-owned catalog drives cards, checkout amounts and fulfillment.
export function walletCatalog():WalletOffer[] {
  const packs = [
    {id:'starter',name:'Starter',description:'For your next idea and your first launch.'},
    {id:'studio',name:'Pro',description:'For creators building their next chapter.',featured:true},
    {id:'scale',name:'Advanced',description:'Room for a full pipeline of ideas.'},
  ];
  return [
    ...packs.map(pack=>{
      const price=creditPacks.find(p=>p.id===pack.id)!;
      return {id:`pack:${pack.id}`,name:pack.name,description:pack.description,featured:pack.featured,credits:price.credits,cents:price.cents,price:`$${(price.cents/100).toFixed(2)}`,features:[`${price.credits.toLocaleString('en-US')} AI credits`,'AI products, images, and videos','Purchased credits never expire']};
    }),
    ...subscriptionPlans.flatMap(plan=>(['month','year'] as const).map(interval=>{
      const cents=interval==='month'?plan.monthlyCents:plan.annualCents;
      return {id:`subscription:${plan.id}:${interval}`,name:plan.name,description:plan.description,featured:'featured' in plan&&plan.featured,credits:plan.credits,cents,price:`$${(cents/100).toFixed(2)}`,interval,features:[...plan.features]};
    })),
  ];
}
