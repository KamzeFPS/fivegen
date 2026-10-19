# FiveGen — AI Growth Operator

FiveGen builds the launch around a creator’s expertise. The creator records and writes the actual course or product; AI helps interview them, draft an authentic video sales letter (VSL), prepare landing-page copy, and write a follow-up draft. A published landing page captures real leads in the creator’s CRM.

## Current product

One **Create your product** action opens the creator workflow. Navigation stays compact: **Overview, Products, Marketing, Customers**. Each product has content, Offer Lab, checkout, and resources; its Marketing area contains Creator Voice, VSL, Funnel, Campaigns, and Automations.

1. **Checkout and customer access.** Stripe Connect Accounts v2 provides full-dashboard creator accounts that receive direct charges. One-time hosted Checkout supports USD, EUR, GBP, CAD, and AUD. Signed webhooks verify account, mode, amount, currency, email, and payment state before granting access. Buyers get a private portal with purchased lessons, recordings, and files. A purchase cookie lasts 30 days; signing in with the matching verified email recovers access. Consulting purchases include intake, one session booking, creator availability, cancellation/rebooking, and a private meeting link. Refunds (including partial refunds) and disputes revoke access; disputes do not automatically restore access when closed. New checkouts collect a fixed 5% FiveGen application fee. The earnings dashboard shows actual Stripe fees, FiveGen fees and creator net by settlement currency; pending fees remain unknown, and historical checkouts keep their original fee policy. Test and live records are separated.
2. **Email automations.** Creators edit and approve welcome/nurture/launch sequences and purchase onboarding. Approved snapshots are immutable for enrolled recipients; draft edits require reapproval for future enrollments. Marketing requires explicit consent, includes unsubscribe, and stops after a verified live purchase. Purchase onboarding requires active paid access. A durable SQLite queue uses leases, bounded retries, and Resend idempotency. Pausing stops pending sends. Delivery logs distinguish pending, sent, failed, and cancelled. Test purchases never trigger customer email.
3. **Creator Voice Library.** Store owner-wide stories, video/audio recordings, transcripts, and creator-attested evidence with permission controls. Optional OpenAI transcription uses the existing server key, costs the displayed 10 credits (or included unlimited access), accepts at most 25 MB, and requires review. Up to 100 sources; 20,000 characters per transcript. Only approved sources enter AI context. VSL uses the five latest approved sources; campaigns select up to eight. Context is bounded to 6,000 characters per source and 18,000 overall. Voice recordings remain creator-only, even if mistakenly referenced by public content. Removing a library entry retains the uploaded recording until explicitly removed.
4. **Campaign Studio.** Generate or manually write social posts, short-video scripts, and launch emails using the offer brief and selected source citations. Edit and approve drafts, assign publishing reminders, copy/export text, and export an `.ics` calendar. Calendar entries are reminders for manual publication: no social posting or campaign email sending is implied. Use Automations for approved email delivery.
5. **Offer Lab.** Compare two customer/outcome/package/price hypotheses, share a public preference survey at `/o/<slug>`, collect real feedback, and copy a chosen offer into the VSL brief. Publishing is an explicit snapshot; changed offers start a separate research round. Survey participation does not opt people into marketing or charge them. Results are directional audience feedback, not a prediction of sales.
6. **Growth overview.** Track anonymous daily visits, VSL plays, CTA clicks, new leads, bookings, paid orders, and revenue. Product and campaign-tag views use actual saved events. Test/live payments and currencies stay separate; revoked orders and purchases of FiveGen credits are excluded. Totals describe period activity rather than a single visitor cohort. Rule-based next actions explain their evidence. Event collection respects Do Not Track and does not store email or IP addresses.

The existing VSL interview covers customer, problem, beliefs, story, promise, proof, offer, tone, and CTA. AI creates editable growth copy using administrator-managed OpenAI/Anthropic credentials, with 10/30-credit generation, idempotency, concurrency guards, and refunds on failure. Product creation keeps course content creator-authored. Manual modules, lessons, private recordings, resources, generated creative assets, CRM notes/status/export, AI credits, historical billing, and assistant connections remain available. Upload limits are 100 MB/file and 2 GB/account.

Public funnel pages at `/g/<slug>` contain reviewed landing snapshots and an explicitly selected VSL. Private edits and voice sources never automatically publish. The older storefront, referral, and seller-payment endpoints stay retired; creator commerce uses new `/api/commerce` routes and separate tables. Community hosting is not included. The proposed $299/month price was not applied; existing FiveGen billing prices are unchanged.

## Plans and credits

Every account receives 3 complete AI product runs and 20 planning messages per UTC month. Manual editing and downloads are free. Additional content costs 10 credits per OpenAI step or 30 per Anthropic step. Images cost 12 credits and 5-second videos with audio cost 160.

Recommended subscriptions are Pro at $29/month or $290/year with 2,500 credits released monthly, and Studio at $69/month or $690/year with 6,000 credits released monthly. Subscription credits expire monthly; one-time purchased credits do not expire. The existing packs remain 1,000/$15, 2,500/$35 and 6,000/$75. Annual plans never release twelve months of credits upfront. See [studio release notes](docs/creation-studio.md) and [sandbox catalog IDs](docs/paddle-subscriptions-sandbox.json).

## Run and configure

Use Node 24.13+. Run `npm ci`, `npm run build:render`, then `npm run start:render` with the existing private configuration in `.env.render.local`. Production uses Render with a persistent SQLite/media disk; see [Render setup](docs/render.md). The optional Sites/Cloudflare target remains available through `npm run dev` and `npm run build`.

Additive migrations `0011_growth_operator.sql` and `0012_creator_growth_suite.sql` introduce the growth and creator-business tables; later numbered migrations extend them without replacing records. The Render runtime applies pending migrations on startup; the Cloudflare target must receive the same migrations. No historical migration or billing record is replaced.

Only administrators supply shared AI credentials. Never commit env files or expose server API keys to the client. A cloned repository does not include the production database or its encrypted credentials: local live AI requires the administrator’s existing configuration. The local fixture preview does not fabricate AI output or call providers.

## Stripe Connect setup

Use the ignored `.env.render.local` file (local) or private deployment environment (production). Never paste secret keys into the browser, client code, a commit, or a public issue.

- `STRIPE_MODE=test` and `STRIPE_SECRET_KEY`: start with a matching test key. The existing Stripe AI-wallet integration uses the same mode/key but a separate webhook.
- `STRIPE_CONNECT_WEBHOOK_SECRET`: signing secret for **connected-account snapshot events** sent to `https://YOUR_DOMAIN/api/commerce/webhook`.
- Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, and `account.updated`.
- `STRIPE_COMMERCE_ENABLED=true` only after the connected-account webhook is configured. Missing setup leaves settings editable but connect/checkout unavailable.
- Each creator opens Account menu → Seller payments, supplies their actual business country, and completes Stripe-hosted onboarding once for all products. They can publish before connecting payments; they finish content, set a price and explicitly enable sales when ready.
- Customer portal: `/customer`. For development, Stripe CLI forwarding can deliver Connect events to `/api/commerce/webhook`; use the signing secret printed by that CLI session, never a placeholder. See [Accounts v2 configuration](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration), [Stripe Connect direct charges](https://docs.stripe.com/connect/direct-charges) and [Connect webhooks](https://docs.stripe.com/connect/webhooks).

Live credentials can be kept in the ignored `.env.stripe-live.local` profile while `.env.render.local` remains in test mode. Load that profile explicitly only for a production runtime with a production database and the live connected-account webhook. The `STRIPE_SECRET_KEY_LIVE` name is a private staging value; the runtime reads `STRIPE_SECRET_KEY` from the selected profile. The prepared live profile leaves commerce, wallet checkout, and the email worker disabled. Restricted keys need Accounts v2 and Account Links v2 write access, plus connected-account Checkout write and Payment Intent/Charge read access. Read-only verification does not prove write permissions. See [Stripe restricted-key permissions](https://docs.stripe.com/keys/restricted-api-keys).

Product sales activation is scoped to the selected Stripe mode. Enabling a test offer never enables it in live mode; enable and save the product again after live onboarding. Local fixture previews reject live Stripe keys.

For a local Connect preview, install the official Stripe CLI and run `npm run preview:connect` (or set `STRIPE_CLI_BIN` to its executable). This test-only helper forwards connected-account events and starts the isolated studio preview; its signing secret stays in memory. Keep it running during testing. It does not modify deployment configuration.

The supplied local Stripe test key has been authenticated. A real test creator account was created through Accounts v2; no charges or account agreements were submitted. End-to-end real Stripe fulfillment still requires a connected account, webhook delivery, and a test payment. Live enablement, account agreements, tax configuration, and deployment require the account owner's review.

## Email delivery and runtime

Configure `RESEND_API_KEY` and a verified `EMAIL_FROM` address (no display name) through existing administrator settings or server environment, plus canonical `APP_ORIGIN`. Creators supply their sender name, reply-to address, and postal address in Automations. Set `AUTOMATION_DISPATCH_SECRET` to a random secret of at least 32 characters. The Render server calls its authenticated internal dispatch route once per minute, with at most five jobs per batch. Durable records catch up after restarts; retries stop before Resend's 24-hour idempotency-key retention expires.

`AUTOMATIONS_WORKER_ENABLED=false` disables the Render timer. The local preview always disables it. An external scheduler may POST `/api/automations/dispatch` with `Authorization: Bearer <AUTOMATION_DISPATCH_SECRET>`; configure one for a Cloudflare deployment because the Node timer runs only on Render. See [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys). No email is sent merely by saving a sequence. The creator must explicitly review and activate it. No live marketing messages were sent during development.

## Validation

- `npx tsc --noEmit`
- `npm run build:render`
- `npm run test:growth` — actual SQLite and routes, fixture AI transport, credit charging/refunds, snapshots, CRM isolation, uploads, and curriculum behavior.
- `npm run test:growth:suite:runtime` — built-app HTTP checks for all six feature APIs, authentication, data isolation, survey exports, and missing-provider states; blocks external calls.
- `npm run test:growth:suite` — real SQLite creator commerce, automation queue, voice/campaign, Offer Lab, and analytics tests; external providers use fixtures.
- `npm run test:growth:runtime` — built Node app over real HTTP, isolated sessions/database/media, public data isolation, video streaming, publish/unpublish, lead capture, and CRM.
- `npm run test:credits`, `npm run test:studio`, `npm run test:paddle`, `npm run test:paddle:live`, and `node scripts/paddle-runtime-test.mjs` protect existing credit/billing behavior.

The explicit local-only `studio-preview.mjs` harness uses a separate retained SQLite directory and fixture sign-in. It never runs in production. The older journey/commerce integration tests target retired functionality. Real provider output, production sign-in, and deployment should be verified with the existing production configuration before releasing.
