// Compatibility metadata for existing workspaces; all features are included.
export type PlanInfo = {tier:"free";limit:null;used:number;status:string;interval:"month"|"year"|null;renewsAt:number|null;cancelAtPeriodEnd:boolean;billingReady:boolean;hasCustomer:boolean};
export const freePlan:PlanInfo={tier:"free",limit:null,used:0,status:"free",interval:null,renewsAt:null,cancelAtPeriodEnd:false,billingReady:false,hasCustomer:false};
