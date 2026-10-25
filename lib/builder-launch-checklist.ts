import type {BuilderDraft,BuilderWorkspace} from './builder-contract';
import {builderFamily} from './builder-contract';
import {offerView} from './offer-view';

export type BuilderLaunchRepair='save'|'price'|'content'|'review'|'payments'|'delivery'|'availability'|'experience'|'member-link';
export type BuilderLaunchBlocker={id:string;title:string;detail:string;action:string;repair:BuilderLaunchRepair};
/** Explain the same saved-version prerequisites used by checkout. This never
 * grants access: the selling endpoint still rechecks current provider state. */
export function builderLaunchBlockers(workspace:BuilderWorkspace,draft:BuilderDraft,options:{dirty:boolean;editorialApproved:boolean;sessionAvailable?:boolean|null}):BuilderLaunchBlocker[]{
 const blockers:BuilderLaunchBlocker[]=[],view=offerView({amount:draft.priceCents,currency:draft.currency,pricing:draft.studio?.pricing,tiers:draft.studio?.community?.tiers});
 const add=(id:string,title:string,detail:string,action:string,repair:BuilderLaunchRepair)=>blockers.push({id,title,detail,action,repair});
 if(options.dirty)add('save','Save your latest edits','Checkout uses the saved, reviewed delivery version.','Save draft','save');
 if(!view.priceSet)add('price','Choose your price','Set a paid price of at least 0.50, or explicitly choose Free / lead magnet.','Set price','price');
 if(!workspace.readiness.publishReady)add('content','Finish the required product content',workspace.readiness.checks.find(check=>!check.ready)?.message||'Open Launch review to go directly to each missing item.','Fix required content','content');
 if(!options.editorialApproved)add('review','Approve the saved version','Review your original content and record your approval in Launch review.','Review this version','review');
 if(!workspace.publication||workspace.publication.version!==workspace.version||options.dirty)add('delivery','Publish the current delivery version','Publishing delivery is separate from publishing the public Sales page.','Review & publish delivery','delivery');
 const tiers=draft.studio?.community?.tiers||[],hasFree=tiers.length?tiers.some(tier=>tier.billing==='free'):view.model==='free',hasPaid=tiers.length?tiers.some(tier=>tier.billing!=='free'):view.model!=='free',needsPaidPayments=hasPaid&&!hasFree;
 if(!workspace.payments.mode)add('payment-mode','Choose the checkout environment','The platform must configure live or test checkout before access can open. Get paid shows the setup status.','Check checkout setup','payments');
 if(needsPaidPayments&&(!workspace.payments.configured||!workspace.payments.enabled))add('platform-payments','Payment connection needs attention','FiveGen payment setup is incomplete. Get paid shows the account or platform step that needs attention.','Check payment setup','payments');
 else if(needsPaidPayments&&(!workspace.payments.connected||!workspace.payments.ready))add('seller-payments','Finish your seller verification','Complete your account’s Stripe onboarding before accepting paid purchases.','Finish seller setup','payments');
 const family=builderFamily(draft),custom=draft.studio?.custom,session=family==='service'||(custom?.deliveryKinds as string[]|undefined)?.includes('sessions')||(custom?.blocks as {kind?:string}[]|undefined)?.some(block=>block.kind==='session'),community=family==='community'||(custom?.deliveryKinds as string[]|undefined)?.includes('community');
 if(session){const service=draft.studio?.service,provider=service?.meetingProvider||'manual';if(!['jitsi','zoom','google-meet'].includes(provider)&&!https(service?.meetingUrl||draft.fields.meetingUrl||''))add('meeting','Choose how the session is delivered','Add your private meeting URL in Product details or configure a meeting provider in Member experience.','Set meeting details','experience');if(options.sessionAvailable!==true)add('availability',options.sessionAvailable===false?'Add an available session time':'Check session availability',options.sessionAvailable===false?'At least one unbooked future session is required before selling a service.':'Load your available times and add a future session before enabling purchases.','Review session availability','availability');}
 if(community&&!draft.studio?.community?.enabled&&!https(draft.fields.communityUrl||''))add('member-link','Set the member-space destination','Enable the FiveGen community in Member experience, or add your private invitation URL in Product details.','Set member access','member-link');
 return blockers;
}
function https(value:string){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}}
