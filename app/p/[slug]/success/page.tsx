import { Brand } from "@/app/ui-brand";
import { ApiError,database,stripe } from "@/lib/server";
import { assertSubscriptionAccess,orderItems,recordPayment,type PurchasedItem } from "@/lib/payments";
import { ArrowDownToLine,Check } from "lucide-react";
import ManageSubscription from "./manage-subscription";
export const dynamic="force-dynamic";
export default async function Success({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{session_id?:string;token?:string}>}){
  const {slug}=await params,q=await searchParams;let token="",error="",title="Your product",subscription=false,items:PurchasedItem[]=[];
  try{
    const p=await database().prepare("SELECT p.*,s.stripe_account FROM products p LEFT JOIN sellers s ON p.owner=s.owner WHERE p.slug=?").bind(slug).first();
    if(!p)throw new ApiError("This product could not be found.");title=String(p.title);
    if(q.session_id){if(!/^cs_[a-zA-Z0-9_]+$/.test(q.session_id)||!p.stripe_account)throw new ApiError("Invalid payment reference.");const session=await stripe(`checkout/sessions/${q.session_id}`,undefined,String(p.stripe_account));if(session.metadata?.product_id!==p.id)throw new ApiError("This payment belongs to a different product.");const saved=await recordPayment(session,String(p.stripe_account));token=String(saved!.token);}
    else if(q.token&&/^[a-zA-Z0-9-]{20,150}$/.test(q.token))token=q.token;
    else throw new ApiError("Your access link is missing. Return to the product page to get started.");
    const order=await database().prepare("SELECT * FROM orders WHERE token=? AND product_id=?").bind(token,p.id).first();if(!order)throw new ApiError("This access link is not valid.");
    subscription=!!order.subscription_id;await assertSubscriptionAccess(order);items=orderItems(order);if(!items.length)items=[{id:String(p.id),slug,title,price:Number(p.price)/100,amount:Number(order.amount)}];
    // Resolve current slugs so renamed products remain deliverable.
    for(const item of items){const current=await database().prepare("SELECT slug FROM products WHERE id=?").bind(item.id).first();if(current)item.slug=String(current.slug);}
  }catch(e){error=(e as Error).message;}
  return <div className="storefront"><nav className="store-nav"><a href="/"><Brand/></a></nav><main className="delivery-card panel"><span className="success-symbol"><Check size={30}/></span><h1>{error?"Let’s check your access.":"Something good is yours."}</h1><p>{error||`Your ${title} package is ready. Save this private access link for your downloads${subscription?" and subscription management":""}.`}</p>{!error&&<div className="delivery-files">{items.map(item=><div key={item.id} className="delivery-item"><a className="button primary" href={`/learn/${item.slug}`}>Open {item.title} · member space</a><a className="button primary" href={`/api/download/${item.slug}?token=${encodeURIComponent(token)}`}><ArrowDownToLine size={17}/>Download product package</a></div>)}</div>}{subscription&&token&&<ManageSubscription token={token}/>}<a className="text-link" href={`/p/${slug}`}>Back to product</a></main></div>;
}
