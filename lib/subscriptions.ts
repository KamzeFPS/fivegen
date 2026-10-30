// Permanent legacy catalog: existing annual and Studio purchases keep their
// original price and monthly credit allowance. Do not use this for new sales.
export const subscriptionPlans = [
  {id:'pro',name:'Pro',monthlyCents:2900,annualCents:29000,credits:2500,description:'A consistent creative practice.',features:['2,500 credits, refreshed every month','All content, image and video tools','Private projects and editable downloads']},
  {id:'studio',name:'Studio',monthlyCents:6900,annualCents:69000,credits:6000,description:'Room for bigger ideas and more visuals.',features:['6,000 credits, refreshed every month','All content, image and video tools','Private projects and editable downloads'],featured:true},
] as const;
export type SubscriptionPlanId=(typeof subscriptionPlans)[number]['id'];
export type BillingInterval='month'|'year';

// Current launch offers are monthly only. A new interval must have an explicitly
// approved price; an annual price is never inferred from the monthly amount.
export const creatorSubscriptionPlans = [
  {id:'pro',name:'Creator Pro',monthlyCents:2900,credits:2000,commissionBps:300,description:'More AI for a consistent creative practice.',features:['3% FiveGen fee per sale; Stripe fees additional','2,000 AI credits, refreshed every month','All builders, marketing tools and editable downloads','Top up credits whenever you need more'],featured:true},
  {id:'scale',name:'Scale',monthlyCents:9900,credits:6000,commissionBps:0,description:'More room to create. Keep more of every sale.',features:['0% FiveGen fee per sale; Stripe fees additional','6,000 AI credits, refreshed every month','All builders, marketing tools and editable downloads','Top up credits whenever you need more']},
] as const;
