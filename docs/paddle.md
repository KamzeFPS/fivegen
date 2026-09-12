# Paddle pricing and sandbox verification

Live preparation is documented in [paddle-live-readiness.md](paddle-live-readiness.md), with catalog mappings in [paddle-live-mapping.json](paddle-live-mapping.json). The public service remains on sandbox pending verification. `.env.example` now describes the separate live staging profile; use the IDs below only for sandbox environments.

The public `/pricing` page uses `@paddle/paddle-js` with the existing Vinext / Next.js App Router. The final catalog is **one-time credit packs**, per the owner's clarification. There is no recurring billing toggle or subscription.

## Catalog

- Starter: 1,000 credits; Paddle pack `starter`; USD amount `"1500"`; product `pro_01m2a1vherpw11dztrvkjjvzd0`; price `pri_01m2a1xs85jt0dn03czxwq7174`.
- Pro: 2,500 credits; Paddle pack `studio`; USD amount `"3500"`; product `pro_01m2a2263vtzdwm8y513tdezse`; price `pri_01m2a22x9e44gqtz1mx8ck4x09`.
- Advanced: 6,000 credits; Paddle pack `scale`; USD amount `"7500"`; product `pro_01m2a247h47wrp1jrby52mgbj6`; price `pri_01m2a24wedk6c8z0j0d389ge86`.

Edit the page's tier names, descriptions, and features in `lib/paddle/catalog.ts`. Price IDs are runtime configuration, not frontend constants. Sandbox product names retain their explicit credit counts.

## Environment

Set the `PADDLE_*` variables listed in `.env.example`. `PADDLE_ENVIRONMENT` must explicitly be `sandbox` or `production`. There is no default; missing configuration or mismatched token prefixes fail closed. `PADDLE_CLIENT_TOKEN` is a client-side token (`test_` for sandbox, `live_` for production). `PADDLE_API_KEY` and `PADDLE_WEBHOOK_SECRET` are server-only. The API key needs customer read and customer portal session write permissions. The signing secret is the notification destination's endpoint secret (usually `pdl_ntfset_...`), not its `ntfset_...` ID and not an API key.

Locally, Workers development uses `.dev.vars`; Render uses `.env.render.local`. These files are ignored by Git. Configure the same variables privately in your deployment's environment settings; never commit environment files or put them in public assets. The client receives only the validated environment, public token, tier definitions, optional country, and signed-in email.

## Required dashboard step (owner)

In the **sandbox** dashboard, go to **Checkout → Checkout settings** and set **Default payment link** to `http://localhost:5173/pricing`. This is a dashboard-only setting. Localhost is allowed in sandbox. For a deployed sandbox preview, use that preview's `/pricing` URL. This page loads Paddle.js so it can also handle Paddle's `_ptxn` payment links.

For live checkout, first complete Paddle verification and domain approval. The default link must use a real, approved domain, not localhost. Replace the environment, token, and all three price IDs together. Do not attempt a live payment as part of sandbox setup.

## Pricing and checkout behavior

- The server reads `x-vercel-ip-country`, then `cf-ipcountry`. Only valid ISO 3166-1 alpha-2 codes are accepted. Missing values, `OTHERS`, `XX`, `T1`, and invalid codes are omitted entirely; Paddle then detects the visitor's IP.
- The browser calls `Paddle.PricePreview()` for the three IDs. It renders `lineItem.formattedTotals.total` verbatim. There is no frontend price calculation, rounding, or currency reformatting.
- Checkout uses the exact returned price ID and quantity. A configured recurring/trial price or missing total is rejected. Buyers sign in and accept the existing terms before checkout. `/api/paddle/checkout` validates the catalog ID and stores a server-owned checkout intent with account, email, and credit entitlement. The authenticated email and preview address are prefilled, and checkout email changes are disabled.
- Checkout is an overlay with the `one-page` variant and an absolute `successUrl` ending `/welcome`. Changing billing address or tax information inside Paddle may update the final total.
- Loading, retry, checkout errors, timeouts, mobile layouts, and reduced-motion preferences are handled. The `/welcome` checkout receipt preserves the existing explicit `return_to` onboarding/terms flow.

## Verified fulfillment and state

`POST /api/webhooks/paddle` reads `request.text()` and calls the official Node SDK's `paddle.webhooks.unmarshal(rawBody, signingSecret, signature)` before dispatch. Invalid or absent signatures return 400. Configuration, API, validation, and database failures return non-2xx so Paddle can retry. Unhandled, verified events are acknowledged and ignored.

The existing sandbox notification destination is `ntfset_01m2a3d59znze9a5fxrhg12ffx`, active at `https://www.fivegen.ai/api/webhooks/paddle`, subscribed to all events with platform traffic. Its secret is stored only in private environment configuration. Required events: customer.created/updated; subscription.created/updated/canceled/activated/trialing/paused/past_due/resumed; transaction.completed; adjustment.created/updated.

Drizzle migration `0007_serious_ikaris.sql` adds separate Paddle customer, subscription, checkout intent, transaction, adjustment, event audit, and sandbox wallet tables. Existing Stripe records remain intact. Entity IDs are primary keys, state upserts compare microsecond event timestamps, and missing customers get placeholders so subscriptions can arrive first. Later customer events hydrate these placeholders without losing account ownership.

For a completed credit payment, the server validates its persisted intent, exact price, quantity, one-time billing, and customer email fetched from Paddle. Customer ownership is bound once and cannot move to another account. Wallet credit and the credited flag are committed in one SQLite transaction, making concurrent retries safe. Transactions without a recognized intent are mirrored but do not grant credits or account ownership.

Sandbox fulfillment writes only `paddle_test_wallets`; it never adds production AI capacity. Production fulfillment adds `wallets.purchased`. Verified approved refunds and chargebacks reverse the proportional number of purchased credits, rounding up to a whole credit. Chargeback reversals restore the corresponding amount. Adjustment IDs and event timestamps prevent double reversals; refunds received before payment are applied when it arrives. An already-spent production balance can become negative to retain the debt. No billing records are deleted.

The welcome page polls the authenticated account endpoint for the completed transaction. Browser checkout events and storage affect presentation only; they never grant credit or access.

## Subscription access and customer portal

`subscriptionGrantsAccess()` and server-side `hasPaddlePaidAccess(owner)` grant access for current `active` or `trialing` status. Scheduled cancellation or pause does not revoke access early. Actual `paused`, `past_due`, or `canceled` status denies paid access until a later access-granting status arrives. The pricing catalog remains three one-time packs; FiveGen's free workspace features are not newly gated.

`/account/billing` shows the signed-in account's mirrored subscriptions, recent purchases, and sandbox balance. Manage billing calls `POST /api/paddle/portal`. The endpoint authenticates first, checks request origin, resolves the Paddle customer and subscriptions from the account-owned database rows, and calls the official SDK. Client-supplied customer IDs, subscription IDs, and emails are never used. It returns a short-lived HTTPS Paddle portal URL with `private, no-store`; the browser redirects directly. Portal session URLs are never persisted.

## Permanent infrastructure

Keep the notification destination and signing secret, all three catalog products and prices, and every Paddle or mirrored customer, subscription, transaction, adjustment, and fulfillment record. These are the running fulfillment system, not disposable test artifacts. Do not delete or suggest deleting them after testing. The webhook test suite retains its isolated SQLite fixture databases under `outputs/paddle-qa/`.

## Validation

Run `npm run test:paddle` and `npx tsc --noEmit`. After `npm run build:render`, run `node scripts/paddle-runtime-test.mjs` to check authenticated billing SSR and webhook/auth boundaries in the actual Node production runtime. All isolated fixture databases are retained. The handler tests use the actual SDK signature verifier and real SQLite migrations and transactions; only outbound API calls and the session boundary use contract fixtures. They cover signature rejection before writes, duplicate and out-of-order deliveries, access states, account isolation, fulfillment, proportional refunds, chargebacks, and the portal boundary. Then use the sandbox checkout in a real browser: verify the localized total, corresponding line item, successful test payment, redirect to `/welcome`, verified credit balance, and the customer portal. Use Paddle's documented sandbox test card; never take a live payment as part of this test.

Verified on September 12, 2026 using the actual Paddle sandbox:

- Starter displayed and charged a $15.00 test total for 1,000 credits (checkout `che_01m2a2wqskcw6b80gzeaft43rm`). The test completed and the browser arrived at `/welcome` showing sandbox completion.
- Pro checkout showed 2,500 credits and $35.00, matching the card. Advanced showed 6,000 credits and $75.00. These checkouts were closed without payment.
- Signed-in local test email was prefilled by Paddle.
- A 390px mobile viewport had no horizontal overflow and all purchase controls were 48px tall.
- The owner configured the missing default payment link after Paddle returned `transaction_default_checkout_url_not_set`.
- Hosted Starter checkout `che_01m2a4kw3eee52j9qe887v24fx` completed for $15.00 on `www.fivegen.ai`; `/welcome` confirmed 1,000 sandbox credits from the authenticated account API. Paddle notification `ntf_01m2a4mzpngpxaa4q7xnsa2mae` (`transaction.completed`) was delivered successfully to the hosted webhook. Production credits were unaffected.
- The completed transaction is `txn_01m2a4kw1qc6nxxgbrhgw0g2h4`. Replay `ntf_01m2a4tyv0na7k7vcap68k8969` returned 200 with `ignored: false`; the billing screen retained exactly 1,000 sandbox credits across replay and redeployment. No duplicate credit grant occurred.
- `/account/billing` opened Paddle's authenticated sandbox customer portal through the signed-in account's Manage billing button. Its Payments page showed the same transaction, paid $15.00 for FiveGen — 1,000 AI Credits. No client-supplied customer ID was used and no real payment was taken.
