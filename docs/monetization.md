# FiveGen monetization policy

Implemented September 11, 2026. All amounts are USD. This is a contribution-margin model, not a promise of profit.

## Customer offer

Free includes 10 saved products and a one-time grant of 1,200 text-only starter credits. A default GPT-4.1 mini build uses 5–12 steps at 10 credits each, so the allowance covers at least ten maximum-length builds, or more shorter builds/revisions. Deleting products, retrying a completed job, and rejoining a plan do not renew the starter allowance. Free has a 10% platform sales commission. Images and videos require purchased credits or Pro monthly credits.

Pro costs $29/month or $290/year, allows 100 products, and unlocks deals, upsells, funnels, recurring prices, and a 3% sales commission. It includes 1,000 credits per month. Annual subscribers receive a monthly allowance, not all twelve months upfront. Included credits expire/reset on the subscription's monthly anniversary and do not roll over. Purchased credits do not expire or disappear on downgrade. No automatic top-ups: customers explicitly choose a refill and pay through Stripe.

Refills on either plan: 1,000 credits for $15; 2,500 for $35; 6,000 for $75. Credits are usage units, not money and are not withdrawable. A refund or chargeback removes the associated credits; credits already used can leave an outstanding balance that blocks more generation. Won disputes restore the withheld credits, less any refunded amount.

Generation prices: GPT-4.1 mini text step/rewrite, 10 credits; Claude Haiku 4.5 step/rewrite, 30; FLUX 1.1 Pro Ultra image, 12; Kling 2.6 Pro five-second video with audio, 160. A three-image + one-video campaign costs 196 credits. An administrator selecting Anthropic changes text step pricing; the creator sees the active rate before generating. Text requests are capped at 64,000 UTF-8 bytes of input and 14,000 output tokens, with at most ten content sections. Manually modified legacy products with more sections can cost more total steps, still billed per step.

## Cost basis and margin

Official source prices checked September 11, 2026:

- [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini): $0.40 per million input tokens and $1.60 per million output tokens.
- [Claude Haiku 4.5](https://platform.claude.com/docs/en/about-claude/pricing): $1 input / $5 output per million tokens.
- [FLUX 1.1 Pro Ultra](https://fal.ai/models/fal-ai/flux-pro/v1.1-ultra): $0.06 per image at the configured endpoint/output.
- [Kling 2.6 Pro](https://fal.ai/models/fal-ai/kling-video/v2.6/pro/text-to-video): $0.14 per second with audio, or $0.70 for the configured five-second video.
- [Stripe US domestic-card benchmark](https://stripe.com/pricing): 2.9% + $0.30. Actual fees vary by country, payment method, currency, account agreement, and Stripe Billing/Connect configuration.

Successful generation costs are bounded conservatively near $0.005 per credit at these settings: $0.06 / 12 for images; $0.70 / 160 for video; maximum text input bytes treated as an upper-bound token estimate plus the output limit gives $0.048 / 10 for GPT and $0.134 / 30 for Haiku. These bounds exclude failed provider requests, which can still incur costs. Provider rates and tokenization assumptions need review when models or prices change.

At 100% included-credit use, reserve $5 provider cost per Pro month. Using the US card benchmark, monthly Pro contribution is $29 − $1.141 − $5 = $22.859 (78.8%). Annual contribution is ($290 − $8.71) / 12 − $5 = $18.4408/month (76.3% of monthly recognized subscription revenue). Both exclude Stripe Billing fees, infrastructure, support, refunds, chargebacks, taxes, and customer acquisition.

At the same maximum provider cost, refill contributions before operating costs are: $9.265 on the $15 pack (61.8%); $21.185 on the $35 pack (60.5%); $42.525 on the $75 pack (56.7%). The fully consumed Free allowance budgets up to $6 in successful provider cost per account. A $60 Free sale yields $6 platform commission; this is an acquisition-cost recovery illustration, not a forecast that every user will sell.

For a $49 sale, FiveGen receives $4.90 on Free or $1.47 on Pro. Creators retain $44.10 or $47.53 before their separate payment-processing fees. At $29/month, Pro's seven-percentage-point commission reduction alone breaks even for a creator at approximately $414.29 monthly gross sales.

## Administrator and safeguards

`ADMIN_EMAILS=kamzewac@gmail.com` authorizes the requested super admin using the trusted authenticated identity, never a client-provided admin flag. Additional IDs can be explicitly configured with `ADMIN_USER_IDS`. Without an allowlist, nobody is admin. Every admin endpoint checks authorization on the server.

The admin-only section in **AI & credits** stores shared master provider keys under the dedicated platform record, encrypted using `CREDENTIAL_ENCRYPTION_KEY`. Customers never receive keys or enter their own keys. Existing per-customer credentials are ignored; they are not silently repurposed as platform keys. Runtime secrets `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `FAL_KEY` are optional fallbacks; removing a stored key does not remove a runtime fallback.

The default daily AI cost-reservation cap is $10 UTC/day. The admin can change it and pause generation. Reservations include failed calls and use conservative input/output bounds; this is a spend guard, not invoice-grade cost reporting. Configure provider-side spending limits too. Free account farms, support costs, and payment abuse can still affect profitability; the cap bounds the platform's daily authorized estimate.

Credit debits and ledger states are atomic D1 batches. No balance can be overspent by simultaneous requests. Successful steps consume credits; confirmed failures return them once. Media requests with uncertain status keep their reservation until confirmed. Starter credits cannot be spent on media. Webhook and return-page retries grant a purchased pack only once. Subscription credits are granted from verified active paid subscription state and the current monthly window.

Expiring monthly credits are spent before starter or purchased credits. Refunded monthly credits retain the original expiry window. The seller dashboard and sales export report the FiveGen fee and the amount after that fee, explicitly before processor fees.

Stripe direct charges collect `payment_intent_data[application_fee_amount]` for one-time sales and `subscription_data[application_fee_percent]` for subscriptions. Connected `invoice.created` events update draft renewal invoices to the creator's current plan fee; existing customer subscriptions continue after downgrade. Payment processing remains on Standard connected accounts. Existing unrelated connected-account invoices are ignored. Ordinary Whop links cannot enforce these fees and are therefore disabled until a tracked integration exists.

## Required live setup

Enter the master provider keys as the super admin. Existing encrypted-storage configuration is preserved. Stripe keys and the two webhook signing secrets must be configured before real payments or refills can work. Follow commerce.md's updated event lists; `invoice.created` is required for renewal commission changes. Configure portals on platform and connected accounts.

Before launch, verify test-mode purchases, top-ups, duplicate/out-of-order webhooks, refunds and disputes, monthly/annual renewal, canceled/past-due subscriptions, and fee transfer to the platform account. Automated local tests exercise ledger SQL, permissions, arithmetic and delivery, with mocked Stripe for financial transitions. No real payment or paid AI request was made in this change.

Local verification commands:

- `node --experimental-strip-types scripts/credits-test.mjs`: actual ledger SQL with a SQLite-backed D1 adapter and mocked Stripe. Covers concurrent spending, grant/refund idempotency, refund/dispute reversals, renewal windows, downgrade, cap and pause controls.
- `node --experimental-strip-types scripts/commission-test.mjs`: actual Checkout route and payment-recording logic with mocked transport; checks application fees, subscription fee percentages, renewals, and tamper rejection.
- `node scripts/credit-access-test.mjs`: running local app, ordinary customer account; checks admin denial, key redaction, login requirements and invalid credit purchases.
- `node scripts/admin-settings-test.mjs`: temporarily set local-only `ADMIN_USER_IDS=local_seedy`, restart the local preview, run the test, then remove that local override and restart. Saves/removes a fake encrypted key and verifies paused AI returns credits without a provider call. Never grant this test identity in production.

Desktop and 390px phone walkthroughs verified the credit wallet, visible generation prices, and super-admin controls; customer accounts see no key fields. The original commerce integration suite also passed after the changes.
