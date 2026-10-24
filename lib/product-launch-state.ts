/** Presentation only. Unknown facts remain unknown; these labels never authorize sales. */
export type LaunchFactState='complete'|'attention'|'pending'|'unknown';
export type ProductLaunchFacts={
 contentSaved?:boolean;
 salesPagePublic?:boolean;
 deliveryPublished?:boolean;
 checkoutEnabled?:boolean;
 draftChanges?:boolean;
 buyerCheck?:'provider-test'|'simulated'|'not-checked';
 blocker?:string;
 blockerOwner?:'creator'|'platform';
 canonicalPath?:string|null;
};
export type ProductLaunchMilestone={id:'content'|'page'|'checkout'|'buyer';label:string;detail:string;state:LaunchFactState};
export function productLaunchSummary(facts:ProductLaunchFacts){
 const page=facts.salesPagePublic,checkout=facts.checkoutEnabled;
 const label=page===true?(checkout===true?'Selling':checkout===false?'Page live · sales paused':'Page live · check checkout'):facts.deliveryPublished?'Delivery published · sales page private':'Private draft';
 const milestones:ProductLaunchMilestone[]=[
  {id:'content',label:facts.contentSaved===true?'Content saved':'Content needs a check',detail:facts.contentSaved===true?'Your saved content is ready.':facts.contentSaved===false?'Finish the required content and delivery checks.':'Open Content to check the saved version.',state:facts.contentSaved===true?'complete':facts.contentSaved===false?'attention':'unknown'},
  {id:'page',label:page===true?'Sales page public':page===false?'Sales page private':'Sales page not checked',detail:page===true?(facts.draftChanges?'Visitors see the published version. You have draft changes.':'Your public sales page is viewable.'):facts.deliveryPublished?'Your delivery page is published. Publish the canonical sales page before sharing it.':'Publish your sales page when it is ready to share.',state:page===true?'complete':page===false?'pending':'unknown'},
  {id:'checkout',label:checkout===true?'Checkout enabled':checkout===false?'Checkout paused':'Checkout not checked',detail:checkout===true?'The saved selling switch is on. Payment and access checks still run for every purchase.':facts.blocker||'Open Price & access to check payment setup and enable checkout explicitly.',state:checkout===true?'complete':checkout===false?'attention':'unknown'},
  {id:'buyer',label:facts.buyerCheck==='provider-test'?'Test payment recorded':facts.buyerCheck==='simulated'?'Buyer journey simulated':'Buyer check not done',detail:facts.buyerCheck==='provider-test'?'A verified provider test payment exists. It is not live revenue.':facts.buyerCheck==='simulated'?'A no-charge preview was completed. External payments and email are not verified.':'Preview delivery and run a safe buyer check before launch.',state:facts.buyerCheck==='provider-test'?'complete':facts.buyerCheck==='simulated'?'attention':'pending'},
 ];
 return {label,milestones,canShare:page===true&&!!facts.canonicalPath,canonicalPath:page===true?facts.canonicalPath||null:null};
}
