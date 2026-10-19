import type Stripe from 'stripe';

// Freeze the policy on each checkout intent. Existing intents retain the policy
// they were created with, including the historical zero-commission policy.
export const COMMERCE_COMMISSION_BPS = 500;
export function commerceCommission(amount:number,basisPoints=COMMERCE_COMMISSION_BPS){
 if(!Number.isSafeInteger(amount)||amount<0||!Number.isSafeInteger(basisPoints)||basisPoints<0||basisPoints>10000)throw new Error('Invalid commission amount.');
 return Number((BigInt(amount)*BigInt(basisPoints)+BigInt(5000))/BigInt(10000));
}

export type CommerceFeeSnapshot={
 chargeId:string;chargeApplicationFeeAmount:number;refundedAmount:number;disputed:boolean;
 balanceTransactionId:string|null;settlementAmount:number|null;settlementCurrency:string|null;
 stripeFeeAmount:number|null;platformFeeAmount:number|null;creatorNetAmount:number|null;
 availability:'pending'|'available';availableAt:number|null;
};

// Stripe's charge balance transaction already subtracts BOTH processing and
// application fees. Never subtract the FiveGen fee from its net a second time.
// Settlement values may be in a different currency from the customer's order.
export function commerceFeeSnapshot(charge:Stripe.Charge,applicationFeeAmount:number):CommerceFeeSnapshot{
 if(!Number.isSafeInteger(applicationFeeAmount)||applicationFeeAmount<0||!Number.isSafeInteger(charge.amount_refunded)||charge.amount_refunded<0)throw new Error('Invalid Stripe charge accounting.');
 const result:CommerceFeeSnapshot={chargeId:charge.id,chargeApplicationFeeAmount:applicationFeeAmount,refundedAmount:charge.amount_refunded,disputed:!!charge.disputed,balanceTransactionId:null,settlementAmount:null,settlementCurrency:null,stripeFeeAmount:null,platformFeeAmount:null,creatorNetAmount:null,availability:'pending',availableAt:null};
 const balance=charge.balance_transaction;
 if(!balance||typeof balance==='string')return result;
 const source=typeof balance.source==='string'?balance.source:balance.source?.id;
 const integer=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0;
 if(source!==charge.id||!integer(balance.amount)||!integer(balance.fee)||!Number.isSafeInteger(balance.net)||balance.amount-balance.fee!==balance.net||! /^[a-z]{3}$/.test(balance.currency)||!['pending','available'].includes(balance.status))throw new Error('Stripe balance transaction does not reconcile.');
 const details=balance.fee_details;
 if(!Array.isArray(details)||details.some(f=>!integer(f.amount)||f.currency!==balance.currency)||details.reduce((sum,f)=>sum+f.amount,0)!==balance.fee)throw new Error('Stripe fee details do not reconcile.');
 const platformFee=details.filter(f=>f.type==='application_fee').reduce((sum,f)=>sum+f.amount,0);
 // Application fees can be created asynchronously. Do not publish an early
 // balance snapshot that is still missing its application-fee debit.
 if(applicationFeeAmount>0&&platformFee===0)return result;
 if(balance.currency===charge.currency&&platformFee!==applicationFeeAmount)throw new Error('Stripe application fee does not reconcile.');
 if(applicationFeeAmount===0&&platformFee!==0)throw new Error('Unexpected Stripe application fee.');
 return {...result,balanceTransactionId:balance.id,settlementAmount:balance.amount,settlementCurrency:balance.currency,stripeFeeAmount:balance.fee-platformFee,platformFeeAmount:platformFee,creatorNetAmount:balance.net,availability:balance.status as 'pending'|'available',availableAt:integer(balance.available_on)?balance.available_on*1000:null};
}
