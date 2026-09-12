# FiveGen: Paddle live preparation

Prepared September 12, 2026. **The live catalog is ready, but live payments are not released.** Public checkout remains on sandbox. The Terms/refund update is a separate policy-only release; it does not include the live billing code or credentials.

## Catalog and private configuration

The three active sandbox credit packs were recreated in the live account. There were no sandbox discounts to migrate. Prices are one-time, quantity one, with no trial or billing cycle:

- Starter: 1,000 credits, USD `"1500"`; live product `pro_01m2a5d5v7s9m4x037vfmb52x3`, price `pri_01m2a5d64xpnf4wwtp94n62vxh`.
- Pro: 2,500 credits, USD `"3500"`; live product `pro_01m2a5d57f4274y98pt1qrmnsf`, price `pri_01m2a5d5gwe5fc9y631bxcrp5s`.
- Advanced: 6,000 credits, USD `"7500"`; live product `pro_01m2a5d4e47qjg5c82bnypxjtr`, price `pri_01m2a5d4w5qa8m4jhhfr6dc06t`.

[paddle-live-mapping.json](paddle-live-mapping.json) contains every sandbox/live product and price mapping. Historical sandbox IDs in this mapping, test documentation, and private sandbox profiles are intentionally preserved. Operational live IDs are read from environment variables; there are no hard-coded sandbox checkout URLs or price IDs in application code.

The supplied active live client token is configured in ignored `.env.paddle-live.local`. Notification `ntfset_01m2a5bsqv22c2e1f7x4sqq8ng` is active at `https://www.fivegen.ai/api/webhooks/paddle`. Its actual endpoint signing secret was retrieved using the official SDK and stored privately; the `ntfset_...` ID is not a signing secret. All required fulfillment, subscription, customer, and adjustment events are included. The destination is permanent infrastructure. Its public receiver still uses sandbox credentials until the coordinated live cutover, so live delivery must not yet be treated as verified.

The MCP tools were unavailable in this session; the catalog and notification operations used the official Paddle Node SDK with the authorized live API key. The additional live client token created during preparation, `ctkn_01m2a5d6qscf3d28p7pp865fzw`, is retained but not used by this profile. No catalog, notification, token, customer, transaction, subscription, or database record was deleted.

## Local validation

`npm run build:render` then `npm run start:paddle:staging` starts the isolated local profile at `http://localhost:5183`. The private profile uses a separate database under `outputs/paddle-live-staging`, never the public Render disk. Local preview Google credentials are nonfunctional fixtures because production Google credentials are not in this checkout. Google sign-in is not tested by this preview; authenticated server checks use isolated, retained SQLite session fixtures.

Confirmed in the browser: live `Paddle.PricePreview()` returned `$15.00`, `$35.00`, and `$75.00` for the three live IDs. The page displays Paddle's formatted strings without price math. Buttons show that purchases are awaiting approval. No live checkout or payment was attempted because no checkout domain is approved. The final domain check shows a rejected apex submission, not approval. The sandbox payment, welcome redirect, webhook fulfillment, replay idempotency, and customer portal were already verified; see [paddle.md](paddle.md).

`PADDLE_ENVIRONMENT=production` requires an explicit `PADDLE_LIVE_RELEASE=staging` or `approved`. Staging disables purchase buttons and rejects authenticated checkout-intent creation with 503 before any intent is written. Missing environment or mismatched tokens fail visibly. This application flag does not grant Paddle approval and is not a substitute for Paddle's domain enforcement.

Retain receives `pwCustomer: { id }` only from a Paddle customer row owned by the authenticated session in the selected environment. Anonymous users receive `{}`. Internal user IDs, email addresses, other owners' customers, and sandbox customer IDs are not reused as live Retain identities. This follows [Paddle.Initialize guidance](https://developer.paddle.com/paddle-js/methods/paddle-initialize/).

Passed: `npm run test:paddle`, `npm run test:paddle:live`, `npx tsc --noEmit`, and `node scripts/paddle-runtime-test.mjs --live`. These cover raw SDK signatures, idempotent/out-of-order fulfillment and refunds, access states, portal ownership, scoped Retain identity in actual server rendering, and the server-side purchase lock. All isolated test databases remain on disk.

## Webhook network security

`runtime/render/paddle-webhook-ips.mjs` fetches `data.ipv4_cidrs` from [Paddle's live IP endpoint](https://api.paddle.com/ips). It caches validated `/32` addresses for ten minutes, refreshes dynamically, and rejects unknown sources with 403. An unavailable or invalid fresh list produces 503 with retry guidance, rather than accepting traffic against an expired list. Raw-body SDK signature verification remains mandatory after the network check.

The September 12 snapshot was: `34.237.3.244/32`, `34.195.105.136/32`, `34.232.58.13/32`, `35.155.119.135/32`, `34.212.5.7/32`, `52.11.166.252/32`. These are audit evidence, not a hard-coded runtime allowlist.

Set `PADDLE_WEBHOOK_IP_MODE=direct` for local Node; the socket address is authoritative and forwarded headers are ignored. On the managed Render service, use `PADDLE_WEBHOOK_IP_MODE=render`. Render mode requires the Render runtime flag, a private proxy peer, Cloudflare's request marker, and an unambiguous public source in the forwarded chain. Cloudflare's proxy ranges are also fetched dynamically. A supplied Paddle IP alongside another public caller is rejected. Checks cover encoded and trailing-slash webhook paths as well.

Do not apply a service-wide allowlist that blocks ordinary website visitors; enforcement is on the webhook route. Proxy behavior is based on [Render's ingress description](https://render.com/articles/how-render-handles-ddos-attacks). Actual live delivery through Render's edge remains unverified: confirm the forwarded chain and a signed delivery in a separate staging deployment or during the controlled release before opening purchases. Do not weaken the check to trust an arbitrary leftmost forwarded IP if delivery fails.

## Website review: ready and missing

The read-only API/HTTP results are in [paddle-live-audit.json](paddle-live-audit.json), checked at 07:04 UTC on September 12. Render deployment `dep-daifhh15efls73dahjhg` succeeded for policy-only commit `37aa79dfdd63e12c723228f21aa596223ae5e63d`. Public HTTP and browser checks confirmed the new policy; the signed-in account still held exactly 1,000 sandbox credits after deployment.

- **Real product and HTTPS:** `https://www.fivegen.ai/` returns 200 and serves FiveGen. `https://fivegen.ai/pricing` redirects to the canonical `www` pricing page. The homepage describes creation workflows, and `/terms` and `/pricing` explain features and AI credits. Improvement: add a concise homepage description such as “Create and publish digital products with AI. Buy one-time credits for additional product generation, images, and videos.” Make clear that Paddle sells FiveGen credits; creators' own customer payments use Stripe.
- **Terms:** `https://www.fivegen.ai/terms` is a real 200 page. It includes the FiveGen brand, account rules, credit behavior, selling fees, and support. Confirm that the business or sole-proprietor identity matches the identity supplied to Paddle; no legal entity name was inferred.
- **Refunds/cancellations:** `/refund` is the requested canonical route, with `/refunds` redirecting there. The policy-only release includes the request process, Paddle buyer support, credit delivery, one-time purchase cancellation details, historical subscriptions, and separate creator purchases. It preserves statutory rights and links to [Paddle's current refund policy](https://www.paddle.com/legal/refund-policy). Publicly verified: `https://www.fivegen.ai/refund` returns 200; `https://www.fivegen.ai/refunds` redirects to that real policy. The homepage and pricing page link directly to it.
- **Privacy — missing:** `https://www.fivegen.ai/privacy` returns 404. Publish a truthful Privacy Policy covering the actual account, uploaded content, prompts/AI providers, billing, customer/CRM data, cookies, retention, and rights-request process. Link it from the homepage, pricing page, and onboarding before requesting domain review. Do not substitute a generic placeholder or claim compliance without reviewing the actual practices.
- **Support:** `kamzewac@gmail.com` is reachable from homepage → Terms → email, within two clicks. The deployed policy release also provides a direct homepage support link.
- **Pricing:** the three live base amounts, USD currency, credit quantities, and one-time billing match the existing sandbox catalog. There are no observed catalog discrepancies. Localized tax-inclusive totals are supplied by Paddle and can change with billing details. The public pricing page intentionally still labels sandbox checkout.
- **Domain approval — blocked:** the initial live Checkout Domains API list was empty. At the final check, `fivegen.ai` appeared with status `rejected` (ID `chedom_01m2a5zrwncks7dkntsd80btwf`); the API does not expose a rejection reason. Read the reason in the dashboard or Paddle’s review email, address it, and request another review. Submit the actual checkout host `www.fivegen.ai` under live **Checkout → Website approval**; it was not listed as approved. Add every other domain/subdomain that actually launches checkout; the apex redirect alone does not launch a separate checkout. No domain was claimed approved merely because it resolves or works in sandbox.
- **Default live payment link — unverified:** under live **Checkout → Checkout settings**, set `https://www.fivegen.ai/pricing`. This is an owner-managed dashboard setting. Live requires a real approved domain; localhost is only suitable for sandbox tests. The agent did not change this setting.
- **Business/identity verification — unconfirmed:** follow the account verification prompts. Possessing a live API key is not evidence that verification has passed.

These checks follow Paddle's current [domain review guidance](https://www.paddle.com/help/start/account-verification/what-is-domain-verification), which calls for accessible product/pricing information, policies, identity information, HTTPS, and review of checkout domains. Paddle determines eligibility and may request further evidence. See [account verification](https://www.paddle.com/help/start/account-verification) for its business and identity steps.

## Release sequence after the gaps are resolved

1. Publish and review the missing Privacy Policy; verify the public policy URLs and navigational links. Complete domain review and account verification in [the live dashboard](https://vendors.paddle.com/). Set the approved live default payment link there.
2. Keep the live preparation branch out of the customer deployment until those prerequisites pass. Do not upload the entire local environment file: it contains localhost paths and preview-only Google settings. Preserve the production Google, Stripe, encryption, origin, and disk configuration.
3. At the coordinated release, deploy the prepared application and set only the live Paddle API key, client token, price IDs, notification secret, `PADDLE_ENVIRONMENT=production`, `PADDLE_WEBHOOK_IP_MODE=render`, and initially `PADDLE_LIVE_RELEASE=staging`. Keep all existing sandbox and live records. Verify a signed delivery through the actual Render ingress and its idempotent fulfillment path before opening purchases.
4. Set `PADDLE_LIVE_RELEASE=approved` only after the preceding checks pass. Confirm live checkout opens on the approved domain and shows the exact displayed pack. Taking a real payment is the later “Test and go live” step; none was taken during preparation.

**Current decision: continue verification setup in `vendors.paddle.com`; do not enable live payments yet.**
