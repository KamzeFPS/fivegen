# Paddle sandbox pricing

The public `/pricing` page uses `@paddle/paddle-js` with the existing Vinext / Next.js App Router. The final catalog is **one-time credit packs**, per the owner's clarification. There is no recurring billing toggle or subscription.

## Catalog

- Starter: 1,000 credits; Paddle pack `starter`; USD amount `"1500"`; product `pro_01m2a1vherpw11dztrvkjjvzd0`; price `pri_01m2a1xs85jt0dn03czxwq7174`.
- Pro: 2,500 credits; Paddle pack `studio`; USD amount `"3500"`; product `pro_01m2a2263vtzdwm8y513tdezse`; price `pri_01m2a22x9e44gqtz1mx8ck4x09`.
- Advanced: 6,000 credits; Paddle pack `scale`; USD amount `"7500"`; product `pro_01m2a247h47wrp1jrby52mgbj6`; price `pri_01m2a24wedk6c8z0j0d389ge86`.

Edit the page's tier names, descriptions, and features in `lib/paddle/catalog.ts`. Price IDs are runtime configuration, not frontend constants. Sandbox product names retain their explicit credit counts.

## Environment

Set the five `PADDLE_*` variables listed in `.env.example`. `PADDLE_ENVIRONMENT` must explicitly be `sandbox` or `production`. There is no default; missing configuration or mismatched token prefixes produce a visible setup error and disable buying. `PADDLE_CLIENT_TOKEN` is a client-side token (`test_` for sandbox, `live_` for production). A server API key is neither required nor read by this pricing page.

Locally, Workers development uses `.dev.vars`; Render uses `.env.render.local`. These files are ignored by Git. Configure the same variables in your deployment's environment settings; never upload local environment files. The client receives only the validated environment, public token, tier definitions, optional country, and signed-in email.

## Required dashboard step (owner)

In the **sandbox** dashboard, go to **Checkout → Checkout settings** and set **Default payment link** to `http://localhost:5173/pricing`. This is a dashboard-only setting. Localhost is allowed in sandbox. For a deployed sandbox preview, use that preview's `/pricing` URL. This page loads Paddle.js so it can also handle Paddle's `_ptxn` payment links.

For live checkout, first complete Paddle verification and domain approval. The default link must use a real, approved domain, not localhost. Replace the environment, token, and all three price IDs together. Do not attempt a live payment as part of sandbox setup.

## Pricing and checkout behavior

- The server reads `x-vercel-ip-country`, then `cf-ipcountry`. Only valid ISO 3166-1 alpha-2 codes are accepted. Missing values, `OTHERS`, `XX`, `T1`, and invalid codes are omitted entirely; Paddle then detects the visitor's IP.
- The browser calls `Paddle.PricePreview()` for the three IDs. It renders `lineItem.formattedTotals.total` verbatim. There is no frontend price calculation, rounding, or currency reformatting.
- Checkout uses the exact returned price ID and quantity. A configured recurring/trial price or missing total is rejected. An authenticated email and preview address are prefilled. Anonymous checkout detects the visitor's location itself.
- Checkout is an overlay with the `one-page` variant and an absolute `successUrl` ending `/welcome`. Changing billing address or tax information inside Paddle may update the final total.
- Loading, retry, checkout errors, timeouts, mobile layouts, and reduced-motion preferences are handled. The `/welcome` checkout receipt preserves the existing explicit `return_to` onboarding/terms flow.

## Scope and fulfillment

This change adds a Paddle **sandbox pricing and checkout flow**. FiveGen's existing Stripe wallet fulfillment and seller payment flow remain in place. Sandbox transactions do not grant production AI credits. The browser completion marker controls only the welcome message, never wallet credit or access.

Before replacing live credit purchases with Paddle, add a signed server-side transaction-completed webhook, account binding, an idempotent credit ledger, and refund/dispute reversal handling. Never grant credits from `checkout.completed`, a URL, or browser storage. The public pricing page is not a production wallet fulfillment integration.

## Validation

Run `node scripts/paddle-test.mjs` and `npx tsc --noEmit`. Then use the sandbox checkout in a real browser: verify the localized card total, the corresponding checkout line item, successful test payment, and redirect to `/welcome`. Use Paddle's documented sandbox test card; never use a real card for this test.

Verified on September 12, 2026 using the actual Paddle sandbox:

- Starter displayed and charged a $15.00 test total for 1,000 credits (checkout `che_01m2a2wqskcw6b80gzeaft43rm`). The test completed and the browser arrived at `/welcome` showing sandbox completion.
- Pro checkout showed 2,500 credits and $35.00, matching the card. Advanced showed 6,000 credits and $75.00. These checkouts were closed without payment.
- Signed-in local test email was prefilled by Paddle.
- A 390px mobile viewport had no horizontal overflow and all purchase controls were 48px tall.
- The owner configured the missing default payment link after Paddle returned `transaction_default_checkout_url_not_set`.
