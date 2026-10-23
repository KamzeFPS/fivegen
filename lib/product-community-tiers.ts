import {ApiError,database} from './server';
import type {ProductStudioConfig} from './product-studio-contract';
import {selectedCommunityTier} from './product-community-tier-contract';

/** An immutable selected plan is meaningful only alongside checkout proof. */
export async function assertCommunityTierEntitlement(orderId:string,snapshot:{studio?:ProductStudioConfig}){
 let tier;try{tier=selectedCommunityTier(snapshot);}catch{throw new ApiError('This purchase has no verified membership plan. Contact the creator.',403);}if(!tier)return;
 const db=database();
 let proof=await db.prepare('SELECT o.status order_status,o.amount,o.mode,o.product_id,o.owner,i.pricing_model,i.status,i.period_end,i.spec FROM commerce_orders o JOIN product_commerce_intents i ON i.order_id=o.id WHERE o.id=? AND NOT EXISTS(SELECT 1 FROM commerce_revocations r WHERE r.account_id=o.account_id AND r.mode=o.mode AND r.payment_intent=o.payment_intent)').bind(orderId).first();
 if(!proof)proof=await db.prepare("SELECT p.status order_status,p.amount,p.mode,p.product_id,p.owner,i.pricing_model,i.status,i.period_end,i.spec,e.product_id included_product_id FROM product_bundle_entitlements e JOIN commerce_orders c ON c.id=e.order_id JOIN commerce_orders p ON p.id=e.parent_order_id JOIN product_commerce_intents i ON i.order_id=p.id WHERE c.id=? AND c.status='paid' AND c.product_id=e.product_id AND c.owner=p.owner AND c.mode=p.mode AND NOT EXISTS(SELECT 1 FROM commerce_revocations r WHERE r.account_id=p.account_id AND r.mode=p.mode AND r.payment_intent=p.payment_intent)").bind(orderId).first();
 if(!proof||proof.order_status!=='paid'||proof.status!=='active'&&proof.status!=='trialing')throw new ApiError('This membership is not active.',403);
 let spec:Record<string,unknown>;try{spec=JSON.parse(String(proof.spec));}catch{throw new ApiError('Membership payment proof could not be verified.',403);}
 const bundle=proof.included_product_id,selected=bundle&&spec.bundleCommunityTierIds&&typeof spec.bundleCommunityTierIds==='object'?(spec.bundleCommunityTierIds as Record<string,unknown>)[String(bundle)]:spec.communityTierId;
 if(selected!==tier.id||Number(spec.amount)!==Number(proof.amount))throw new ApiError('Membership payment proof does not match this plan.',403);
 if(proof.pricing_model==='subscription'&&Number(proof.period_end||0)<=Date.now())throw new ApiError('Your membership has ended. Choose an active plan to continue.',403);
 if(tier.billing==='free'){if(!bundle&&(proof.pricing_model!=='free'||Number(proof.amount)!==0))throw new ApiError('Free membership proof does not match this plan.',403);}
 else if(proof.pricing_model!=='subscription'||Number(proof.amount)<50||spec.interval!==tier.billing||Number(proof.period_end||0)<=Date.now())throw new ApiError('Your membership has ended. Choose an active plan to continue.',403);
}
