// Client-safe plan information. Billing and seller checkout resolve the actual
// entitlement on the server; selecting a plan in the UI never grants its rate.
export const creatorPlans = {
  free: { id: 'free', name: 'Free', commissionBps: 500, commissionPercent: 5 },
  pro: { id: 'pro', name: 'Creator Pro', commissionBps: 300, commissionPercent: 3 },
  scale: { id: 'scale', name: 'Scale', commissionBps: 0, commissionPercent: 0 },
  'legacy-studio': { id: 'legacy-studio', name: 'Studio (legacy)', commissionBps: 300, commissionPercent: 3 },
} as const;

export type CreatorPlanId = keyof typeof creatorPlans;
export type CommerceFeePlanId = CreatorPlanId | 'historical';
export type CreatorPlanState = {
  id: CreatorPlanId;
  name: string;
  commissionBps: number;
  commissionPercent: number;
  subscriptionId: string | null;
  paidThrough: number | null;
  source: 'free' | 'stripe' | 'paddle';
};

export function freeCreatorPlan(): CreatorPlanState {
  return { ...creatorPlans.free, subscriptionId: null, paidThrough: null, source: 'free' };
}
