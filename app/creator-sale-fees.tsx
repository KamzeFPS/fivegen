import './creator-sale-fees.css';

/** The seller pays these fees; the customer's displayed price stays unchanged. */
export function CreatorSaleFees({compact=false}:{compact?:boolean}){
  return <aside className={`creator-sale-fees ${compact?'is-compact':''}`} aria-label="Product sale fees">
    <div className="creator-sale-fees-heading"><strong>Know what you keep.</strong><span>5% FiveGen fee</span></div>
    <p>From each new sale, FiveGen deducts 5% of the sale price. Stripe deducts its processing fees separately. The customer pays the price you set.</p>
    <div className="creator-sale-fees-formula"><span>Sale price</span><span>− FiveGen fee</span><span>− Stripe fees</span><strong>= Your earnings</strong></div>
    <small>Stripe fees vary by payment method, currency and account. Your Sales & activity dashboard shows the actual breakdown after Stripe confirms it. Earnings are separate from funds available for bank payout.</small>
  </aside>;
}
