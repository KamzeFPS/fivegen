export const plans = {
  free: {name:"Free",limit:10,monthly:0,yearly:0},
  pro: {name:"Pro",limit:100,monthly:29,yearly:290},
} as const;
export type PlanInfo = {tier:"free"|"pro";limit:number;used:number;status:string;interval:"month"|"year"|null;renewsAt:number|null;cancelAtPeriodEnd:boolean;billingReady:boolean;hasCustomer:boolean};
export const freePlan:PlanInfo={tier:"free",limit:10,used:0,status:"free",interval:null,renewsAt:null,cancelAtPeriodEnd:false,billingReady:false,hasCustomer:false};
