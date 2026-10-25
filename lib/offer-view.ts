import type {ProductStudioConfig} from './product-studio-contract';

export type OfferTier = {id:string;name:string;description:string;billing:'free'|'month'|'year';priceCents:number};
export type OfferViewInput = {amount?:number|null;currency?:string|null;pricing?:ProductStudioConfig['pricing']|null;tiers?:OfferTier[]};
export type OfferView = {
 amount:number;currency:string;model:'free'|'one-time'|'subscription'|'pwyw';interval:'month'|'year'|null;
 amountText:string;priceText:string;terms:string;minimumCents:number;suggestedCents:number;
 tiered:boolean;requiresChoice:boolean;bundleCount:number;priceSet:boolean;
};
const cents=(value:unknown,fallback=0)=>typeof value==='number'&&Number.isFinite(value)?Math.max(0,Math.min(999900,Math.round(value))):fallback;
export function offerMoney(amount:number,currency:string){
 try{return new Intl.NumberFormat('en-US',{style:'currency',currency:currency.toUpperCase(),maximumFractionDigits:amount%100?2:0}).format(amount/100);}
 catch{return `${(amount/100).toFixed(2)} ${currency.toUpperCase()}`;}
}
/** A presentation-only projection. Callers choose the saved draft or reviewed
 * publication explicitly; this function never merges the two or sets a charge. */
export function offerView(input:OfferViewInput):OfferView{
 const pricing=input.pricing||{},currency=/^[a-z]{3}$/i.test(input.currency||'')?input.currency!.toLowerCase():'usd';
 const model=['free','subscription','pwyw'].includes(String(pricing.model))?pricing.model as 'free'|'subscription'|'pwyw':'one-time';
 const interval=model==='subscription'?(pricing.interval==='year'?'year':'month'):null;
 const tiers=(Array.isArray(input.tiers)?input.tiers:[]).filter(tier=>tier&&['free','month','year'].includes(tier.billing)&&Number.isFinite(tier.priceCents));
 const tiered=tiers.length>0,minimumCents=cents(pricing.minimumCents),suggestedCents=cents(pricing.suggestedCents)||cents(input.amount);
 const amount=tiered?Math.min(...tiers.map(tier=>tier.billing==='free'?0:cents(tier.priceCents))):model==='free'?0:model==='pwyw'?Math.max(minimumCents,suggestedCents):cents(input.amount);
 const priceSet=tiered?tiers.every(tier=>tier.billing==='free'?tier.priceCents===0:cents(tier.priceCents)>=50):model==='free'||(model==='pwyw'?amount>=Math.max(50,minimumCents):amount>=50);
 const amountText=!priceSet?'Price not set':amount===0?'Free':offerMoney(amount,currency),bundleCount=new Set(Array.isArray(pricing.bundleProductIds)?pricing.bundleProductIds:[]).size;
 const priceText=!priceSet?'Price not set':tiered?`Plans from ${amountText}`:model==='pwyw'?`${offerMoney(amount,currency)} suggested`:model==='subscription'?`${amountText} / ${interval}`:amountText;
 const terms=!priceSet?'The creator has not set a paid price. Checkout is unavailable.':tiered?'Choose a plan at checkout. Each plan shows its amount and renewal interval before you continue.':model==='free'?'No payment required.':model==='subscription'?`Billed every ${interval}. Renews until canceled.`:model==='pwyw'?`Choose your amount. Minimum ${offerMoney(minimumCents,currency)}. One-time payment.`:'One-time payment.';
 return {amount,currency,model,interval,amountText,priceText,terms,minimumCents,suggestedCents,tiered,requiresChoice:tiered||model==='pwyw',bundleCount,priceSet};
}
export function paymentEligibility(input:{mode?:string|null;platformReady:boolean;sellerReady:boolean;selling:boolean;free:boolean}){
 const mode=input.mode==='live'||input.mode==='test'?input.mode:null;
 const blockers=[] as {owner:'Platform'|'Creator';message:string}[];
 if(!mode)blockers.push({owner:'Platform',message:'A payment environment has not been configured.'});
 if(!input.free&&!input.platformReady)blockers.push({owner:'Platform',message:'The platform payment connection needs attention.'});
 if(!input.free&&!input.sellerReady)blockers.push({owner:'Creator',message:'Finish seller payment onboarding.'});
 if(!input.selling)blockers.push({owner:'Creator',message:'New checkout is paused.'});
 return {mode,ready:blockers.length===0,blockers,environment:mode==='test'?'Test checkout · no real payment':mode==='live'?'Live checkout':'Checkout not configured',methods:'Stripe determines eligible payment methods at checkout. A buyer’s location does not automatically change a recurring offer’s currency.'};
}
