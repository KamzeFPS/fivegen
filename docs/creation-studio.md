# AI creation studio release

This release replaces the active marketplace workspace with a private AI product generator. It preserves historical commerce/payment rows and entitlement routes while blocking new storefronts, checkout, seller onboarding, funnels, CRM and referrals at the runtime boundary. OAuth MCP no longer advertises publishing or sales operations.

## Subscription catalog and margin assumptions

Pro: USD 29 monthly or 290 annually, 2,500 credits per monthly cycle. Studio: USD 69 monthly or 690 annually, 6,000 credits per monthly cycle. The four sandbox recurring prices are recorded in paddle-subscriptions-sandbox.json. No live recurring catalog has been created or enabled. All four subscription price env variables are optional; absent prices show Coming soon.

Using the current conservative maximum of USD 0.005 provider cost per credit and Paddle's standard 5% + USD 0.50 checkout fee, full-utilization contribution margins are approximately 50.2%/43.1% for Pro monthly/annual and 50.8%/42.8% for Studio monthly/annual. These are planning estimates before hosting, support, refunds, free allowances and any additional account-specific fees; they do not guarantee net profitability. Reconcile against actual provider and Paddle invoices. Sources: https://www.paddle.com/pricing , https://fal.ai/models/fal-ai/flux-pro/v1.1-ultra , https://fal.ai/models/fal-ai/kling-video/v2.6/pro/text-to-video .

Monthly subscription grants require a verified paid transaction and an active or trialing subscription. Scheduled cancellation alone does not revoke remaining credits. Paused, past_due and canceled states suspend subscription credit spending. Purchased credits are independent. Refunds and disputes proportionally reverse credits, including persistent debt for already-spent credits. Sandbox funds remain separate from real AI capacity.

## Release gates

The public Render service must retain its existing Paddle sandbox configuration until live account verification and checkout domain approval are complete. Do not copy .env.paddle-live.local to Render or set PADDLE_LIVE_RELEASE=approved as part of a UI release. The Privacy Policy was separately published at https://www.fivegen.ai/privacy in commit 113a05e.

Real fal.ai generation cannot be verified locally until the administrator provides FAL_KEY. Missing provider configuration must continue to fail clearly without pretending media was generated. The real OpenAI browser test completed planning, refinement, all content stages, supporting-file generation and a verified ZIP download. The retained artifact is outputs/studio-preview/handoff-guide.zip. The ZIP contains printable HTML, Markdown, three editable resources and launch copy. Monthly/annual PricePreview totals match the sandbox catalog. Desktop rendering and a 375-pixel mobile content viewport were visually checked. The compact navigation and product editor tabs fit without horizontal scrolling. The initial viewport override affected the foreground tab rather than background test tabs; bringing the studio forward allowed the mobile check to run.

## Actual sandbox checkout verification

On September 13, 2026 the owner confirmed checkout opened, payment completed and /welcome loaded in their usual browser. The in-app browser could not render Paddle's sandbox iframe. Paddle's authenticated API confirmed both monthly payments completed:

- Pro: transaction txn_01m2d6rwvbd34eqxfa1k7wgw8d, subscription sub_01m2d6spz59cckj1vbzx8ke1a2, amount 2900 USD cents, 2,500 monthly credits.
- Studio: transaction txn_01m2d6t4a9kc71q8hk2t4jytjc, subscription sub_01m2d6tfmt2wkzvnrz9qvvq258, amount 6900 USD cents, 6,000 monthly credits.

Their seven actual customer, subscription and completed-transaction events were fetched from Paddle and locally signed/replayed through /api/webhooks/paddle. Fourteen deliveries (each event twice, including transactions before subscription events) produced two active subscriptions and exactly 8,500 sandbox credits, with no duplicate grants. Account records and the evidence file outputs/studio-preview/sandbox-subscription-verification.json are retained. This verifies the real event payloads and local fulfillment handler; it is not a direct Paddle network delivery to localhost. Annual checkout has PricePreview and ledger coverage, but no actual annual payment test. Keep the new public subscription price variables unset until direct webhook delivery is verified on the intended hosted environment. Existing public destinations and their secrets were not changed.

## Persistent infrastructure

Keep every Paddle catalog entity, notification destination/signing secret, customer, subscription and transaction. Keep local verification databases and historical payment records. Replaying verified events must never grant duplicate credits. Do not use broad cleanup scripts on billing data.

## Published release

The private studio is published at https://www.fivegen.ai/ from commit 464cc4f7fd03767e227b2d8f65786be1b9fb2a8b. Render deployment dep-daj893m7bikc73b318s0 completed successfully on September 13, 2026. Public health, home, pricing, Privacy, Terms and Refund pages returned HTTP 200; storefront paths, seller checkout and Stripe seller connection paths returned HTTP 410. Public pricing still identifies sandbox payments, and the two new subscriptions show Coming soon with disabled checkout controls. No public billing environment variables or live approval gates were changed. The first private-studio deployment was dep-daj8706k1f9s73cl0640; the second includes the verified mobile navigation fix.
