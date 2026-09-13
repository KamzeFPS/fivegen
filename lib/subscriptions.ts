export const subscriptionPlans = [
  {id:'pro',name:'Pro',monthlyCents:2900,annualCents:29000,credits:2500,description:'A consistent creative practice.',features:['2,500 credits, refreshed every month','All content, image and video tools','Private projects and editable downloads']},
  {id:'studio',name:'Studio',monthlyCents:6900,annualCents:69000,credits:6000,description:'Room for bigger ideas and more visuals.',features:['6,000 credits, refreshed every month','All content, image and video tools','Private projects and editable downloads'],featured:true},
] as const;
export type SubscriptionPlanId=(typeof subscriptionPlans)[number]['id'];
export type BillingInterval='month'|'year';
