# Stripe checkout and billing

New FiveGen purchases use Stripe Checkout Sessions with a credit/debit card form
and Express Checkout for eligible Apple Pay, Google Pay and Link accounts. Wallet
availability depends on the customer's browser, location and wallet setup; the
card form remains available when wallets are not. Use HTTPS for wallet tests.
There is no new Paddle checkout in this flow.

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
Stripe supplies the final formatted checkout total and available local-currency
choices through Adaptive Pricing. The server verifies exact USD integration
amounts regardless of the customer's presentment currency. The Stripe receipt is
the authority for the amount and currency actually charged.

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

The administrator can open `/admin/billing` for read-only checks of mode, matching
keys, account activation, webhook event coverage, portal settings and wallet domain
registration. The release switch stays off until verification is complete; checks
do not activate an account, change credentials, or take payments. If Stripe reports
`charges_enabled=false`, complete its account activation before enabling checkout.
Enable payment method updates in the existing Stripe portal configuration so
customers can replace a card as well as cancel and obtain invoices. The setup
script now enables that feature for configurations it creates or updates.

## Fulfillment and existing accounts

Raw webhook bodies are verified with the Stripe SDK and notification signing
secret, not the API key. The server fetches current Stripe state before applying
changes and matches the stored owner, customer, checkout, quantity, amount and
subscription interval. A browser return does not itself grant credits. A server
reconciliation on `/welcome` can recover a completed checkout ahead of a delayed
webhook, using the same idempotent fulfillment path. Billing's **Refresh purchases**
action also reconciles the signed-in owner's pending purchases and latest paid
subscription invoice. It never creates a payment or accepts a customer ID from
the browser. A signed-out checkout return retains its reference through sign-in.

Each delivered purchase has a **Receipt** button. The server checks ownership and
environment again and reads the verified Stripe charge receipt URL. Receipt links
are minted on request rather than persisted as public URLs. Billing management,
receipt access and purchase reconciliation remain available after Terms updates;
creating a new purchase still requires the current Terms acceptance.

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

## Production fulfillment destination

The active FiveGen Stripe account was verified from the deployed Render runtime on 2026-10-19. Credit purchases use the permanent live destination `we_1USCgMPmtswS6CM74qeTiMP7` at `https://www.fivegen.ai/api/webhooks/wallet`. Its signing secret is stored in Render environment configuration, separate from the existing product-sales webhook. Keep this destination and its signing secret; it is ongoing fulfillment infrastructure, not a test artifact. The live account, customer portal, and wallet domain were checked before enabling checkout. No real payment was made as part of this release.
