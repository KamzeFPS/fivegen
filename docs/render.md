# Deploy the FiveGen growth studio on Render

The current application helps creators build and operate their own products: VSL scripting, landing pages, CRM, Stripe Connect checkout and customer access, approved email automations, a Creator Voice Library, Campaign Studio, Offer Lab, and a growth dashboard. See the [README](../README.md) for current feature scope, configuration, and validation commands.

The new growth suite uses `/g`, `/customer`, `/api/commerce`, and related routes. Historical storefront, seller-payment, referral, and billing routes are not repurposed. Preserve existing Stripe and Paddle webhook destinations, secrets, transaction records, and encrypted provider configuration when updating an existing deployment. Deploying this release does not enable live sales or email delivery.

## Render service configuration

`render.yaml` defines a production Node service with one paid instance in Singapore and a 10 GB persistent disk for SQLite and private media. It does not run a Vite development server or Wrangler emulation. The existing Cloudflare build remains available with `npm run build`.

For an existing service, update that service and preserve its disk, `FIVEGEN_DATA_DIR`, sign-in configuration, and `CREDENTIAL_ENCRYPTION_KEY`. Do not replace it with an empty deployment or regenerate its encryption key. The Blueprint describes the intended configuration; it is not proof that an existing service is hosted in the currently connected Render workspace.

For a new deployment:

1. Put this checkout in a repository that the intended Render account can access. Keep `.dev.vars`, `.env*`, `.wrangler`, and `outputs` out of version control; `.env.example` contains names and defaults only.
2. Create a Google **Web application** OAuth client and configure its consent screen. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Render supports Google and verified email/password sign-in. Register the exact redirect URI `https://www.fivegen.ai/callback`, or the corresponding callback on your canonical domain, and set `APP_ORIGIN` to that HTTPS origin. Publish the Google consent app for external users or add test users while it is in testing.
3. In Render, choose **New → Blueprint**, select the repository, and use the root `render.yaml`. Review the service and persistent-disk costs before creating resources. Render generates `CREDENTIAL_ENCRYPTION_KEY` for a new database; preserve it in secure disaster recovery.
4. Deploy. Startup applies pending SQL migrations transactionally, checks existing migration checksums, and starts the server on `0.0.0.0:$PORT`. Migrations run at startup because service disks are unavailable during build and pre-deploy commands. `/healthz` checks database access and free disk space.

Automatic deployment is off in the Blueprint. Commerce and wallet checkout release switches are supplied explicitly when creating a service and managed in that service's Environment thereafter; Blueprint sync preserves existing values. Set them to `false` for new or staging services until verification is complete. The automation worker defaults to disabled.

## Custom domain and sign-in

If the page returns 421 with `Unrecognized host` while `/healthz` returns 200, the request reached FiveGen but its host does not match the configured origin.

1. Set `APP_ORIGIN=https://www.fivegen.ai`, with no path, in the existing service's Environment settings.
2. Register `https://www.fivegen.ai/callback` as the exact Google OAuth redirect URI.
3. Verify `www.fivegen.ai` under Render **Settings → Custom Domains** and configure the apex-domain redirect. Existing sign-in sessions on a different hostname require a new sign-in.

`RENDER_EXTERNAL_URL` is a fallback only when `APP_ORIGIN` is absent. The known Render hostname and recognized apex alias redirect to the canonical origin; unrelated hosts are rejected. Never expose secrets through `NEXT_PUBLIC_` variables. Startup requires sign-in credentials, persistent storage, and an encryption key of at least 32 characters.

## AI configuration

Sign in with a verified email listed in `ADMIN_EMAILS` to use administration. Add the shared AI credentials there, or use server environment variables such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `FAL_KEY`. Ordinary creators do not supply API keys. Preserve existing provider settings when deploying this release.

Manual product creation does not consume AI credits. Paid AI actions use the existing credit controls and configured providers. Creator-authored lessons and recordings stay private; publishing a funnel exposes an explicit landing-page snapshot and selected VSL. Course checkout checks that the saved content is ready, including completed lesson recordings.

The MCP endpoint is `https://www.fivegen.ai/api/mcp`; discovery and authorization use `APP_ORIGIN`. Reconnect integrations when changing the canonical origin.

## Creator checkout and customer access

Use Stripe Accounts v2 with full Dashboard access and direct charges to each creator's account. New checkout intents collect the creator’s server-verified plan fee through Stripe’s `payment_intent_data.application_fee_amount`: Free 5%, Creator Pro 3%, or Scale 0%. A discount requires an active/trialing subscription with a verified paid period that has not been fully refunded in the same environment; credit purchases alone do not change the fee. The server freezes the rounded fee with the order; historical orders and existing checkout sessions retain their original fee policy. With `defaults.responsibilities.fees_collector=stripe`, Stripe deducts processing fees separately. Do not add a guessed Stripe fee to the application fee or change the fee collector. Current checkout supports one-time card payments; customer access and consulting bookings are served at `/customer`.

1. Test in a separate staging deployment and database using `STRIPE_MODE=test` and a matching server key. Seller payments use optional `STRIPE_COMMERCE_SECRET_KEY`, falling back to `STRIPE_SECRET_KEY` only when the dedicated key is empty. Both payment paths share `STRIPE_MODE`; changing the mode affects both systems. A configured dedicated key with the wrong mode fails closed without falling back.
2. Configure a **connected-account snapshot** webhook at `https://www.fivegen.ai/api/commerce/webhook` for production, or the corresponding staging origin. Set its signing secret as `STRIPE_CONNECT_WEBHOOK_SECRET`. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`, and `account.updated`.
3. Keep `STRIPE_COMMERCE_ENABLED=false` until webhook delivery, onboarding, payment verification, customer access, and refunds have been checked in test mode. Live activation additionally requires the matching live key, live webhook, and completed creator onboarding.
4. Each creator opens **Account menu → Seller payments**, supplies their actual business country, and completes Stripe-hosted onboarding once. All products in that profile share the same mode-specific connection. Product payment links open this account page after saving draft changes. Creators can publish a product page before connecting payments; each finished product must explicitly enable sales when ready. A test-enabled offer cannot accept live payments until explicitly enabled and saved in live mode.

Restricted keys require Accounts v2 and Account Links v2 write access, plus connected-account Checkout write and Payment Intent/Charge read access. Read-only API checks cannot prove write permissions. For a 403, inspect the rejected request in Stripe Workbench to identify the missing permission. Runtime diagnostics log only the operation, status, error code/type and request reference; credentials and provider payloads are never logged. Hosted creator Checkout does not need a publishable key in the frontend. Charge reads expand the charge’s balance transaction to record actual processing fees, application fees, and creator net in the settlement currency. If fees are delayed or unavailable, fulfillment continues and the earnings dashboard labels fees as pending. The owner-only earnings refresh reconciles at most ten records with a shared 60-second cooldown; it never creates charges or changes historical fees. Refunds and revoked orders are excluded from earnings totals, not silently treated as positive income.

For permission isolation, save a dedicated server-only seller key as `STRIPE_COMMERCE_SECRET_KEY` in the existing Render service's Environment settings, then deploy. This leaves the wallet billing key unchanged. The Blueprint's `sync: false` entry prompts only during initial creation; it does not add the secret to an existing service during later syncs. Keep the key in the same Stripe account and mode as the existing connected accounts and seller webhook. Admin payment readiness identifies the selected variable without displaying its value.

Wallet checkout remains separately controlled by `STRIPE_WALLET_CHECKOUT_ENABLED`, `STRIPE_WALLET_WEBHOOK_SECRET`, and `STRIPE_WALLET_PORTAL_CONFIGURATION`. Its webhook is `/api/webhooks/wallet`. Do not replace historical Stripe or Paddle signing secrets or destinations with the new commerce webhook. Existing billing and transaction records remain intact; this release does not change pricing or claim that live billing is enabled.

## Email automations

Email delivery requires the administrator's Resend configuration, a verified `EMAIL_FROM` address, canonical `APP_ORIGIN`, and an `AUTOMATION_DISPATCH_SECRET` of at least 32 characters. Creators provide their sender name, reply-to address, and mailing address, then review and explicitly activate each sequence. Saving drafts does not send messages.

The Blueprint keeps `AUTOMATIONS_WORKER_ENABLED=false`. When deliberately enabled with a worker secret, the Render process dispatches at most five queued messages once per minute. Marketing messages require consent and stop after unsubscribe or a verified live purchase. Purchase onboarding requires a verified live order. Durable jobs catch up after restarts; paused sequences do not send.

New verified-live purchase confirmations use their own worker and do not enable or drain marketing automations. With Resend, a verified sender and canonical HTTPS `APP_ORIGIN` configured, the production server processes at most two purchase confirmations per minute. Its private loopback credential is generated in memory at startup; it is never returned to the client or written to logs. `PURCHASE_EMAILS_WORKER_ENABLED=false` pauses this independent timer. The durable outbox survives restart and retains the same provider idempotency identity. Check readiness and delivery counts in Platform settings → Purchase confirmations. Sandbox and legacy file-offer confirmations stay suppressed.

An external scheduler can also call `/api/automations/dispatch` with the worker secret. Disabling the Render timer does not disable a separately configured scheduler, so inspect both when pausing delivery. See the [README email configuration](../README.md#email-delivery-and-runtime) for details.

## Data and operations

Only files under `/var/data/fivegen` persist. The SQLite database, WAL, private media, and sign-in state live there. Keep one instance; local-disk deployments cannot horizontally scale. Deploying or restarting a disk-backed service involves brief downtime. Maintain independent database/media backups and monitor disk space.

Migrations `0011`–`0014` add the growth-suite tables, offer-research rounds, and mode-specific checkout activation. Migration `0021` adds frozen checkout fees and the actual settlement earnings ledger; its defaults preserve a zero fee for historical checkouts. Migration `0022` adds the frozen fee-plan identity and wallet checkout name, plus an index for paid-plan refund lookups. It does not change applied migration `0021` or reprice any existing order. Historical checkout names are preserved for exact Stripe idempotency recovery. They do not replace historical migrations or transaction records. Startup refuses to run if an already-applied migration has changed. Preserve the database and encryption key together when restoring a backup.

A newly created Render service starts empty. Data, encrypted provider settings, media, access tokens, and account ownership are not copied from another host automatically. Google identities can differ from previous hosting identities. A host migration requires an explicit database/media transfer, ownership mapping, and a planned domain/webhook cutover before sending existing customers to it.

## Local validation

Use Node 24.13 or newer. Build with `npm run build:render`; then run the validation commands in the [README](../README.md#validation), including the growth-suite route/database tests and built-server HTTP tests. Legacy journey/commerce tests describe retired functionality and are not acceptance tests for the new suite.

`npm run start:render` optionally loads ignored `.env.render.local`; Render's process environment takes precedence. A separate ignored `.env.stripe-live.local` profile can store prepared live configuration, but it is inactive unless explicitly loaded. Keep its sales and worker switches disabled during setup. Local fixture previews reject live Stripe credentials and disable the email worker. `npm run preview:connect` supports test-only Stripe CLI forwarding, with its webhook secret held in memory.

Never put credentials in `render.yaml` or version control. The default `npm run dev` and `npm run build` use the Cloudflare target. Both targets share `dist`, so rebuild for the intended target before starting it. The Render start command checks the build marker to reject Worker artifacts.

References: [Render Blueprint fields](https://render.com/docs/blueprint-spec), [persistent disks](https://render.com/docs/disks), [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Stripe Accounts v2 configuration](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration), [Connect webhooks](https://docs.stripe.com/connect/webhooks), [restricted API keys](https://docs.stripe.com/keys/restricted-api-keys).


## Email and password sign-in

`/signin` and `/signup` offer email/password alongside Google. Existing `/signin-with-chatgpt` links open this choice; `?provider=google` starts the unchanged Google OAuth flow. Keep the existing Google OAuth credentials and callback configuration.

Email signup requires name, email, and a 15–128 character password. Verification links expire after 24 hours and require the chosen signup password. No unverified account receives a session or buyer access. `/forgot-password` can recover an account whose signup password is unknown; reset links expire after 30 minutes, are single-use, and require an explicit new password. Password reset signs out all of that account's browser sessions and revokes its connected-assistant credentials. Users then sign in again. Existing Google ownership IDs and orders remain unchanged. Google-only users continue with Google; adding a password to that workspace requires signing in with Google first and explicitly completing password signup/verification with that account's email.

Passwords use unique salts and bounded asynchronous scrypt. Only token hashes are stored; raw verification/reset links are sent privately through the configured Resend sender. Used/expired token metadata is cleared after seven days; hashed rate-limit metadata after two days. Auth emails require the same encrypted Resend connection as purchase confirmations. No new Render secret is needed: the production process generates a private, process-only credential for its loopback delivery bridge. These emails are separate from marketing and do not opt anyone into campaigns.

The append-only migration `0024_email_password_auth.sql` preserves existing sessions and Google owner IDs. Preserve the database, media disk, provider settings, and encryption key on deployment. After building, run `npm run test:auth`, `npm run test:render`, `npm run test:auth:integration`, and `npm run test:render:integration`. The integration checks use retained synthetic databases and no external emails or payments.
