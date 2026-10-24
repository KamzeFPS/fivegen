import {z} from 'zod';
export const partnerPilotDraftSchema=z.object({
 name:z.string().trim().max(100).default(''),
 basis:z.enum(['undecided','gross-paid-less-refunds','creator-net-after-fees']).default('undecided'),
 attribution:z.enum(['undecided','tracked-link-same-session']).default('undecided'),
 attributionDays:z.number().int().min(0).max(90).default(0),
 proposedHoldDays:z.number().int().min(0).max(180).default(0),
 refundPolicy:z.enum(['undecided','void-on-any-refund-or-dispute','proportional-after-verified-refund']).default('undecided'),
 excludeSelfAndPriorBuyers:z.boolean().default(false),
 cohort:z.array(z.object({email:z.string().trim().max(254).refine(value=>!value||z.string().email().safeParse(value).success,'Enter a valid email or leave this draft row empty.').transform(value=>value.toLowerCase()),productIds:z.array(z.string().uuid()).max(20),commissionBps:z.number().int().min(0).max(10000),permissionNote:z.string().trim().max(1000).default('')}).strict()).max(10).default([]),
 review:z.object({economics:z.boolean().default(false),partnerTerms:z.boolean().default(false),attribution:z.boolean().default(false),refunds:z.boolean().default(false),providerCompatibility:z.boolean().default(false)}).default({economics:false,partnerTerms:false,attribution:false,refunds:false,providerCompatibility:false}),
 notes:z.string().trim().max(3000).default(''),
}).strict().superRefine((draft,ctx)=>{if(new Set(draft.cohort.filter(item=>item.email).map(item=>item.email)).size!==draft.cohort.filter(item=>item.email).length)ctx.addIssue({code:'custom',message:'Use one proposal row per partner email.',path:['cohort']});});
export type PartnerPilotDraft=z.infer<typeof partnerPilotDraftSchema>;
export const emptyPartnerPilot=()=>partnerPilotDraftSchema.parse({});
export const partnerPilotCompatibility=[
 'Current creator checkout uses Connect direct-charge commerce_orders; the retired referral engine reads legacy orders, checkout intents and sellers. No adapter has been certified.',
 'The retired engine uses a 14-day pending hold and USD transfer requests; the proposal’s currency, fee basis, approval step and payout responsibilities need provider/accounting review.',
 'A tracked share link is not a referral entitlement. Same-session order linkage is not an approved durable attribution window; the proposed window is not activated.',
 'Verified refund/dispute reversal, duplicate-event, self-referral, prior-buyer and payout-race tests must pass before an invitation or financial activation can be designed.',
];
export const partnerStatementSemantics=[
 {state:'Pending',meaning:'Legacy pending rows whose recorded hold date is still in the future. This is not an approved or paid balance.'},
 {state:'Approved',meaning:'No independent approval state exists in the retired ledger. A checked proposal review is not approval of a commission.'},
 {state:'Payable',meaning:'Legacy pending rows whose hold date has passed, before provider eligibility/refund checks. A date alone does not authorize a payout.'},
 {state:'Paid',meaning:'Rows recorded paid by the retired engine; this view does not verify bank receipt or settlement.'},
 {state:'Reversed / void',meaning:'Recorded cancellation or transfer-reversal outcome from the existing ledger. Refunds/disputes must reconcile before future payouts.'},
 {state:'Processing / unknown',meaning:'Paying, voiding or unrecognized historical states require reconciliation; do not treat them as approved, paid or reusable credit.'},
];
