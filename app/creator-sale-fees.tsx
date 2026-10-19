import './creator-sale-fees.css';
import type {CreatorPlanState} from '@/lib/creator-plans';

/** The seller pays these fees; the customer's displayed price stays unchanged. */
export function CreatorSaleFees({compact=false,plan}:{compact?:boolean;plan?:CreatorPlanState}){
  return <aside className={`creator-sale-fees ${compact?'is-compact':''}`} aria-label="Product sale fees">
    <div className="creator-sale-fees-heading"><strong>Know what you keep.</strong><span>{plan?`${plan.name} · ${plan.commissionPercent}% FiveGen fee`:'Free 5% · Creator Pro 3% · Scale 0%'}</span></div>
    <p>{plan?`Your ${plan.name} plan has a ${plan.commissionPercent}% FiveGen fee on each new sale.`:'Your plan determines FiveGen’s fee: Free 5%, Creator Pro 3%, or Scale 0%.'} Stripe deducts its processing fees separately on every plan. The customer pays the price you set.</p>
    <div className="creator-sale-fees-formula"><span>Sale price</span><span>− FiveGen fee</span><span>− Stripe fees</span><strong>= Your earnings</strong></div>
    <small>Stripe fees vary by payment method, currency and account. Each checkout keeps its recorded fee if your plan changes. Your Sales & activity dashboard shows the actual breakdown after Stripe confirms it. Earnings are separate from funds available for bank payout. <a href="/pricing">Compare plans</a></small>
  </aside>;
}
