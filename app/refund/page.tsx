import type { Metadata } from 'next';
import { Brand } from '../ui-brand';

export const metadata: Metadata = {
  title: 'Refund & Cancellation Policy · FiveGen',
  description: 'Refund requests, credit delivery, and cancellation information for FiveGen AI credits.',
  alternates: { canonical: 'https://www.fivegen.ai/refund' },
};

export default function RefundPolicy() {
  return <main className="terms-page">
    <nav aria-label="Policy navigation"><a href="/" aria-label="FiveGen home"><Brand /></a><a className="button secondary" href="/">Back to FiveGen</a></nav>
    <article>
      <span className="eyebrow">LAST UPDATED SEPTEMBER 13, 2026</span>
      <h1>Refund & Cancellation Policy</h1>
      <p className="terms-lead">Need help with a payment or missing credits? This policy explains how to request support for a FiveGen purchase.</p>
      <nav className="terms-index" aria-label="On this page"><a href="#request">Request a refund</a><a href="#delivery">Credit delivery</a><a href="#cancellation">Cancellations</a><a href="#creator-products">Earlier purchases</a></nav>

      <section id="request">
        <h2>1. Requesting a refund</h2>
        <p>Email <a href="mailto:kamzewac@gmail.com?subject=FiveGen%20billing%20support">kamzewac@gmail.com</a> with the email used at checkout, your receipt or transaction reference, and a description of the issue. Never send your full card number or password. We review duplicate charges, credits that were not delivered, and service problems.</p>
        <p>When your receipt identifies Paddle as the seller, Paddle is the merchant of record for that purchase. You can also request payment support directly through <a href="https://paddle.net/">Paddle’s buyer support</a>. Refund eligibility and processing follow the <a href="https://www.paddle.com/legal/refund-policy">Paddle Refund Policy</a> applicable to your transaction and your consumer rights.</p>
        <p>Paddle generally treats purchases as non-refundable except where its policy or applicable law provides otherwise. It may consider a discretionary request submitted within 14 days of the transaction, taking account of the reason and product usage; a request does not guarantee approval. This does not restrict any statutory refund rights.</p>
      </section>

      <section id="delivery">
        <h2>2. Credit delivery and generation issues</h2>
        <p>FiveGen credit packs are one-time purchases for AI generation within your account. Credits are delivered electronically after the payment is confirmed. If your receipt shows a completed purchase but the balance has not updated, check <a href="/account/billing">Billing & receipts</a> and contact support before buying the pack again.</p>
        <p>Confirmed failed AI generations return their reserved credits. Restoring generation credits is different from refunding a card payment. If a completed purchase is refunded or disputed, its associated credits are reversed. A reversal after credits have been used can leave a negative credit balance, as explained in the <a href="/terms#ai-credits">Terms & Conditions</a>.</p>
        <p>Included free generation allowances have no cash value. Purchased top-up credits do not expire and do not automatically recharge. Subscription credits expire at each monthly reset; annual subscriptions release credits monthly, not all at once. Each generation’s credit cost is shown before you authorize spending.</p>
      </section>

      <section id="cancellation">
        <h2>3. Cancellations and recurring payments</h2>
        <p>One-time credit packs do not renew. Optional monthly and annual subscriptions renew automatically until canceled. Cancel future renewal in Account & billing or through the Paddle link on your receipt. Cancellation normally takes effect at the end of the current paid billing period; an annual plan remains billed annually, with its credits released monthly. Cancellation does not automatically refund earlier charges.</p>
        <p>Manage current Paddle subscriptions in <a href="/account/billing">Billing & receipts</a> or contact support. A previous Stripe subscription can be canceled from AI credits. Refund requests for earlier payments are reviewed separately.</p>
      </section>

      <section id="creator-products">
        <h2>4. Earlier marketplace purchases</h2>
        <p>FiveGen no longer provides storefronts, creator checkout or seller payouts. If you bought a product before this change, the original purchase terms and your consumer rights still apply. Use the contact information on your receipt for delivery, cancellation or refund support. Historical payment and fulfillment records are retained.</p>
        <p>If you cannot reach the creator, email us with the product link and receipt reference so we can help direct your request. This policy does not replace the creator’s responsibilities or your rights as a customer.</p>
      </section>

      <section>
        <h2>5. Your consumer rights</h2>
        <p>Nothing in this policy excludes rights or remedies that cannot be limited under applicable law, including rights relating to defective, misdescribed, or undelivered digital services. Where mandatory law gives you additional rights, those rights apply.</p>
      </section>
      <footer><nav className="legal-links" aria-label="FiveGen links"><a href="/terms">Terms & Conditions</a><a href="/pricing">AI credit pricing</a><a href="mailto:kamzewac@gmail.com">Contact support</a></nav><p>FiveGen · Refund & Cancellation Policy</p></footer>
    </article>
  </main>;
}
