import {ApiError,database,identity} from './server';
import {commerceMode} from './commerce-v2-server';

export type MascotSale={id:string;paidAt:number;amount:number;currency:string};
export type MascotStatus={ownerKey:string;configured:boolean;mode:'live'|'test'|null;paidSales:number;latestSale:MascotSale|null};

// Match the local, verified payment ledger. Included bundle entitlements and
// free access are deliveries rather than additional customer payments.
const paidSaleFilter=(alias:string)=>`${alias}.owner=? AND ${alias}.mode=? AND ${alias}.status='paid' AND ${alias}.amount>0 AND ${alias}.paid_at>0
 AND NOT EXISTS(SELECT 1 FROM product_bundle_entitlements bundle WHERE bundle.order_id=${alias}.id)
 AND NOT EXISTS(SELECT 1 FROM commerce_revocations revoked WHERE revoked.key=${alias}.mode||':'||${alias}.account_id||':'||${alias}.payment_intent)
 AND NOT EXISTS(SELECT 1 FROM commerce_earnings earnings WHERE earnings.order_id=${alias}.id AND (earnings.refunded_amount>0 OR earnings.disputed=1))`;

export async function mascotStatus():Promise<MascotStatus>{
 const user=await identity(),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('fivegen:mascot:owner:v1:'+user.userId)),ownerKey=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
 let mode:'live'|'test';
 try{mode=commerceMode();}catch(error){if(error instanceof ApiError&&error.status===503)return {ownerKey,configured:false,mode:null,paidSales:0,latestSale:null};throw error;}
 // One SQLite statement keeps the count and cursor in the same read snapshot.
 // The existing commerce_order_owner index scopes both reads to owner + mode;
 // only a count and a single latest row leave the database.
 const row=await database().prepare(`SELECT COUNT(*) paid_sales,
  (SELECT json_object('id',latest.id,'paidAt',latest.paid_at,'amount',latest.amount,'currency',latest.currency)
   FROM commerce_orders latest WHERE ${paidSaleFilter('latest')} ORDER BY latest.paid_at DESC,latest.id DESC LIMIT 1) latest_sale
  FROM commerce_orders sale WHERE ${paidSaleFilter('sale')}`).bind(user.userId,mode,user.userId,mode).first();
 const latest=row?.latest_sale?JSON.parse(String(row.latest_sale)) as MascotSale:null;
 return {ownerKey,configured:true,mode,paidSales:Number(row?.paid_sales||0),latestSale:latest};
}
