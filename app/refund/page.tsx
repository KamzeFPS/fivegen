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
      <span className="eyebrow">LAST UPDATED OCTOBER 19, 2026</span>
      <h1>Refund & Cancellation Policy</h1>
      <p className="terms-lead">Need help with a payment or missing credits? This policy explains how to request support for a FiveGen purchase.</p>
      <nav className="terms-index" aria-label="On this page"><a href="#request">Request a refund</a><a href="#delivery">Credit delivery</a><a href="#cancellation">Cancellations</a><a href="#creator-products">Creator products</a></nav>

      <section id="request">
        <h2>1. Requesting a refund</h2>
        <p>Email <a href="mailto:kamzewac@gmail.com?subject=FiveGen%20billing%20support">kamzewac@gmail.com</a> with the email used at checkout, your receipt or transaction reference, and a description of the issue. Never send your full card number or password. We review duplicate charges, credits that were not delivered, and service problems.</p>
        <p>For card, Apple Pay and Google Pay purchases processed by Stripe, contact FiveGen using the email above. Approved refunds are returned to the original payment method. Your wallet or bank determines when the refund appears.</p>
        <p>For earlier purchases, when your receipt identifies Paddle as the seller, Paddle is the merchant of record for that purchase. You can also request payment support directly through <a href="https://paddle.net/">Paddle’s buyer support</a>. Refund eligibility and processing follow the <a href="https://www.paddle.com/legal/refund-policy">Paddle Refund Policy</a> applicable to your transaction and your consumer rights.</p>
        <p>Paddle generally treats purchases as non-refundable except where its policy or applicable law provides otherwise. It may consider a discretionary request submitted within 14 days of the transaction, taking account of the reason and product usage; a request does not guarantee approval. This does not restrict any statutory refund rights.</p>
      </section>

      <section id="delivery">
        <h2>2. Credit delivery and generation issues</h2>
        <p>FiveGen credit packs are one-time purchases for AI generation within your account. Credits are delivered electronically after the payment is confirmed. If your receipt shows a completed purchase but the balance has not updated, check <a href="/account/billing">Billing & receipts</a> and contact support before buying the pack again.</p>
        <p>Confirmed failed AI generations return their reserved credits. Restoring generation credits is different from refunding a card payment. If a completed purchase is refunded or disputed, its associated credits are reversed. A reversal after credits have been used can leave a negative credit balance, as explained in the <a href="/terms#ai-credits">Terms & Conditions</a>.</p>
        <p>Included free generation allowances have no cash value. Purchased top-up credits do not expire and do not automatically recharge. Subscription credits expire at each monthly reset; earlier annual subscriptions release credits monthly, not all at once. Each generation’s credit cost is shown before you authorize spending.</p>
      </section>

      <section id="cancellation">
        <h2>3. Cancellations and recurring payments</h2>
        <p>One-time credit packs do not renew. Creator Pro and Scale are monthly subscriptions that renew automatically until canceled. Earlier annual and Studio subscriptions retain their original billing schedule. Cancel future renewal in Account & billing or through the billing link on your receipt. Cancellation normally takes effect at the end of the current paid billing period; an earlier annual plan remains billed annually, with its credits released monthly. Verified paid selling-fee benefits continue until that paid period ends; paused, past-due, unpaid, canceled, expired or fully refunded subscriptions do not grant the reduced selling fee. Cancellation does not automatically refund earlier charges.</p>
        <p>Manage your wallet subscriptions and earlier Paddle subscriptions in <a href="/account/billing">Billing & receipts</a> or contact support. Legacy Stripe subscriptions can still be canceled from AI credits. Refund requests for earlier payments are reviewed separately.</p>
      </section>

      <section id="creator-products">
        <h2>4. Creator products and earlier purchases</h2>
        <p>Creators can sell their own digital products through FiveGen using their connected Stripe accounts. For the product itself, contact its creator using the product page or receipt for delivery, cancellation and refund support. Stripe handles the connected-account payment and payout arrangements. Earlier purchases retain their original transaction terms and your consumer rights; historical payment and fulfillment records are retained.</p>
        <p>If you cannot reach the creator, email us with the product link and receipt reference so we can help direct your request. This policy does not replace the creator’s responsibilities or your rights as a customer.</p>
      </section>

      <section>
        <h2>5. Your consumer rights</h2>
        <p>Nothing in this policy excludes rights or remedies that cannot be limited under applicable law, including rights relating to defective, misdescribed, or undelivered digital services. Where mandatory law gives you additional rights, those rights apply.</p>
      </section>
      <footer><nav className="legal-links" aria-label="FiveGen links"><a href="/privacy">Privacy Policy</a><a href="/terms">Terms & Conditions</a><a href="/pricing">Plans & credits</a><a href="mailto:kamzewac@gmail.com">Contact support</a></nav><p>FiveGen · Refund & Cancellation Policy</p></footer>
    </article>
  </main>;
}
