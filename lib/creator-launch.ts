import type {ProductLaunchFacts} from './product-launch-state';
export type CreatorLaunchNavigation='details'|'content'|'review'|'payments'|'preview'|'publish'|'sales-page'|'price';
export type CreatorLaunchAction={kind:'navigate';navigate:CreatorLaunchNavigation;label:string}|{kind:'feedback'|'share'|'refresh';label:string};
export type CreatorLaunchFeedback={id:string;source:'conversation'|'email'|'survey'|'other';audience:'potential-buyer'|'customer';summary:string;recordedAt:number;provenance:'creator-entered'};
export type CreatorLaunchStep={id:string;title:string;status:'complete'|'current'|'upcoming';detail:string;action?:CreatorLaunchAction};
export type CreatorLaunchState={
 summary?:ProductLaunchFacts&{title:string;format:string;coverUrl:string|null;pagePublishedAt:number|null;lastSavedAt:number|null};
 productId:string;updatedAt:number;draftVersion:number;path:'paid'|'free'|'mixed';phase:'first-sale'|'free-access'|'improve';
 steps:CreatorLaunchStep[];checkoutAction?:CreatorLaunchAction;nextAction:CreatorLaunchAction;nextTitle:string;nextDetail:string;
 feedback:CreatorLaunchFeedback[];
 sharing:{publicationVersion:number;sharedAt:number|null;channel:string;publicUrl:string|null;current:boolean}|null;
 sales:{livePaidCount:number;firstLivePaidAt:number|null;testPaidCount:number;freeAccessCount:number};
 testPurchase:{complete:boolean;detail:string;action:CreatorLaunchAction};
};

/** Dashboard links open the existing task surface; manual launch actions still
 * belong to Overview rather than being executed by a navigation link. */
export function creatorLaunchActionHref(productId:string,action:CreatorLaunchAction){
 const productPath='/build/'+encodeURIComponent(productId);
 if(action.kind!=='navigate')return productPath+'?area=overview';
 if(action.navigate==='payments')return '/account/payments?return_to='+encodeURIComponent(productPath+'?area=commerce');
 const destinations:Record<Exclude<CreatorLaunchNavigation,'payments'>,string>={details:'details',content:'content',review:'review',price:'commerce',publish:'commerce','sales-page':'page',preview:'content&mode=member'};
 return productPath+'?area='+destinations[action.navigate];
}

/** Use the configured application origin, never an incoming Host or a draft URL. */
export function creatorLaunchPublicUrl(origin:string,slug:string){
 try{const url=new URL(origin);if(url.pathname!=='/'||url.search||url.hash||url.username||url.password||!(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))||slug.length>120)return null;
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))return null;
  return url.origin+'/product/'+encodeURIComponent(slug);
 }catch{return null;}
}
