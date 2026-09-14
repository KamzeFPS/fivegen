# Apple Pay and Google Pay

New FiveGen purchases use Stripe Checkout Sessions + the Express Checkout Element.
Only Apple Pay and Google Pay are mounted. There is no card form, Link, PayPal or
Paddle checkout in the new purchase flow. Wallet availability depends on the
customer's browser, location and wallet setup. Use HTTPS, even for browser tests.

The current catalog is shared between pricing cards and server checkout creation:

| Offer | USD | Credits |
| --- | --- | --- |
| Starter pack | $15 once | 1,000 |
| Pro pack | $35 once | 2,500 |
| Advanced pack | $75 once | 6,000 |
| Pro subscription | $29/month or $290/year | 2,500 each month |
| Studio subscription | $69/month or $690/year | 6,000 each month |

Edit `lib/credit-policy.ts` and `lib/subscriptions.ts` for amounts and allowances;
`lib/wallet-catalog.ts` supplies the displayed offers. Cards show USD explicitly.
Stripe supplies the final formatted checkout total. Adaptive Pricing is disabled;
this flow does not claim that USD prices are localized to another currency.

## Setup

Set `STRIPE_MODE` explicitly to `test` or `live`, with matching
`STRIPE_SECRET_KEY` and `STRIPE_PUBLISHABLE_KEY`. No environment is inferred.
Save test keys to `.env.stripe-wallets.local`, then run:

```powershell
node --env-file=.env.render.local --env-file=.env.stripe-wallets.local scripts/wallet-setup.mjs
```

`APP_ORIGIN` must be the actual HTTPS staging checkout origin. The setup script
registers that domain, creates a permanent `/api/webhooks/wallet` destination,
and creates a portal configuration for invoice history and cancellation at the
end of the paid period. It saves the signing secret locally without printing it.
Set the output variables in the matching Render service environment. Do not
overwrite live keys with test keys on the production service.

Keep `STRIPE_WALLET_CHECKOUT_ENABLED=false` in production until sandbox payment,
webhook credit delivery, refund, renewal, cancellation and `/welcome` return have
been verified. Set it to `true` only after this verification and Stripe account
activation. The checkout API also checks live `charges_enabled` before creating
a session. A missing webhook secret or key mismatch disables checkout.

## Fulfillment and existing accounts

Raw webhook bodies are verified with the Stripe SDK and notification signing
secret, not the API key. The server fetches current Stripe state before applying
changes and matches the stored owner, customer, checkout, quantity, amount and
subscription interval. A browser return does not itself grant credits. A server
reconciliation on `/welcome` can recover a completed checkout ahead of a delayed
webhook, using the same idempotent fulfillment path.

One-time purchases and paid invoices are keyed by Stripe IDs. Test credits are
isolated from production AI capacity. Annual payments release credits monthly;
unpaid future periods cannot grant credits. Refunds and chargebacks reverse
credits, including spent-credit debt, without deleting payment history.

`/api/paddle/checkout` returns 410. Existing Paddle webhooks, customers,
subscriptions, transactions, credits, API keys and portal access remain in place
for prior purchases. Do not delete these persistent entities or cancel existing
subscriptions during this change. Existing subscribers must manage their current
subscription before buying a second one through wallets.

## Validation

Run `node scripts/wallet-billing-test.mjs`, `npm run test:studio`,
`npm run test:credits`, `npx tsc --noEmit` and `npm run build:render`.
On the configured HTTPS test origin, sign in, choose an offer and confirm the
exact wallet total, complete a wallet test payment, confirm `/welcome` and the
isolated test balance, then inspect the corresponding webhook. Keep the test
customer, payment, subscription and notification destination. No real payment
should be made by the agent.

Current official references: [Express Checkout](https://docs.stripe.com/elements/express-checkout-element),
[domain registration](https://docs.stripe.com/payments/payment-methods/pmd-registration),
[wallet testing](https://docs.stripe.com/testing/wallets).
