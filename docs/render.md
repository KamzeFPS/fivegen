# Deploy FiveGen with a Render Blueprint

`render.yaml` runs FiveGen as a production Node service. It uses a paid single instance in Singapore and a 10 GB persistent disk for SQLite and private media. It does not run a Vite development server or Wrangler emulation. The existing Sites build remains available with `npm run build`.

## Before creating the Blueprint

1. Put this checkout in a GitHub, GitLab, or Bitbucket repository that your Render account can access. The current Sites source repository is not automatically linked to Render. Keep `.dev.vars`, `.env*`, `.wrangler`, and `outputs` out of the repository.
2. Create a **Web application** OAuth client in Google Cloud, configure its consent screen, and obtain `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Render sign-in uses Google; Sites-specific sign-in cannot run on another host. In Google, add the exact authorized redirect URI `https://www.fivegen.ai/callback`. If using a custom domain, use that domain instead and set `APP_ORIGIN` to its HTTPS origin. Publish the Google consent app for external users, or add your test users while it is in testing.
3. In Render, choose **New → Blueprint**, select that repository, and use the root `render.yaml`. Enter the two Google credentials and your Stripe secret key when prompted. Render generates `CREDENTIAL_ENCRYPTION_KEY`; preserve it for the lifetime of the database and include it in secure disaster recovery. Review the paid service and disk costs before creating resources.
4. Deploy. The start command applies each SQL migration exactly once, checks existing migration checksums, and then starts the public server on `0.0.0.0:$PORT`. Migrations run at startup because Render does not mount service disks during build or pre-deploy commands. `/healthz` verifies database access and available disk space.

The Blueprint deliberately leaves automatic deployment off. Enable it in Render after the first verified release if desired.

## Fixing 421 on the custom domain

If the page responds with 421 and the body `Unrecognized host` while `/healthz` returns 200, DNS and TLS have already reached FiveGen. The application's configured origin does not match the domain.

1. Open the existing Render service's **Environment** settings.
2. Set `APP_ORIGIN=https://www.fivegen.ai` (no trailing path) and save with a deploy. For Blueprint-managed services, syncing this updated Blueprint applies the same setting.
3. Register `https://www.fivegen.ai/callback` as the exact Google OAuth authorized redirect URI. Existing sign-in sessions on another hostname require a new sign-in.
4. In Render **Settings → Custom Domains**, keep `www.fivegen.ai` verified. Render redirects `fivegen.ai` to `www.fivegen.ai`.

## Production behavior

- Workspaces start empty. Revenue, sales, customers, charts, and CSV exports use stored transactions; there is no sample-data toggle or fabricated growth.
- AI creation requires a configured, unpaused provider. Unavailable AI returns an error without creating a product or consuming a product slot.
- Manual creation is an explicit choice and creates one empty section without consuming AI credits. Blank sections and empty supporting files cannot be published. AI outlines stay incomplete until their content is written.
- `STRIPE_MODE=live` requires a live Stripe secret for payment requests. Signed test webhooks are rejected by the live configuration. A separate staging deployment with its own database and `STRIPE_MODE=test` should be used for Stripe tests; test and live billing data must not share a database.
- Paid product checkout requires a configured sales webhook and a connected account with charges and payouts enabled. Credit purchases require the platform billing webhook. Missing setup produces actionable errors rather than simulated success.

## Enable payments and AI

- Sign in as `kamzewac@gmail.com` to access FiveGen administration. Admin access requires a Google-verified email, not an email typed into a form. For an alternate administrator, update `ADMIN_EMAILS` in Render.
- Add the shared OpenAI/Anthropic and fal.ai keys in FiveGen's administrator settings. Alternatively, use the server environment variables `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `FAL_KEY`. Ordinary customers never supply keys.
- Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_BILLING_WEBHOOK_SECRET` in Render Environment. Both Stripe webhook destinations use `https://www.fivegen.ai/api/webhooks/stripe`: one for connected-account sales and one for platform subscriptions/credit purchases. Use the event lists in [monetization.md](monetization.md) and [commerce.md](commerce.md), then validate test-mode payments before enabling live payments.
- Creators connect their Stripe accounts in **Payments**. The workspace is free with three complete AI product runs per month, credit usage beyond that allowance, and a flat 5% seller transaction commission. Stripe processes creator sales; Paddle processes platform AI credit packs. See [paddle-live-readiness.md](paddle-live-readiness.md) before enabling live Paddle payments.
- The MCP URL becomes `https://www.fivegen.ai/api/mcp`; discovery and authorization use the Render origin automatically. Reconnect Claude/ChatGPT to this new URL.

The Blueprint sets `APP_ORIGIN=https://www.fivegen.ai` and `STRIPE_MODE=live`. Optional environment variables: `PRODUCT_DOMAIN` (configured wildcard product domain), `AI_DAILY_BUDGET_USD`, and the secrets above. `RENDER_EXTERNAL_URL` is only a fallback when `APP_ORIGIN` is unset. The known Render hostname and the apex domain redirect to the configured canonical origin; unrelated hosts are rejected. Never expose secrets through `NEXT_PUBLIC_` variables. The Render runtime refuses to start without sign-in credentials, persistent storage configuration, and an encryption key of at least 32 characters.

## Data and operations

This is a **new, empty deployment**. Sites products, orders, credit balances, provider settings, media, customer access tokens, and MCP connections are not copied automatically. Google account IDs differ from Sites account IDs. Moving the existing business requires an explicit database/media export, preservation of the existing encryption key, ownership mapping, and a planned Stripe webhook/domain cutover. Do not direct existing customers to the new instance until that migration is complete.

Only files under `/var/data/fivegen` persist. The SQLite database, WAL, media files, and sign-in state all live there. Do not remove the disk or use a free/ephemeral service. Keep a single instance; this deployment cannot horizontally scale with a local disk. Restarting/deploying a disk-backed service involves brief downtime. Configure independent backups of the database and media before accepting live sales, and monitor disk usage as generated video accumulates.

## Local validation

Security maintenance (September 11, 2026): updated Next.js to 16.3.4, React/React DOM/React Server Components to 19.2.8, Vinext to beta.9, Vite to 8.3.0, the Cloudflare tooling, fflate, and affected transitive dependencies. `npm audit --omit=dev` reports zero advisories. The full audit retains four moderate findings in the development-only Drizzle migration tool's esbuild dependency chain; that development server is never started by FiveGen. Do not use `npm audit fix --force` to downgrade Drizzle and risk incompatible migration tooling.

Use Node 24.13 or newer. `npm run build:render` builds the Node target, and `npm run test:render` verifies migrations, persistence, transaction rollback, private media, OAuth protections, and header spoofing. `npm run test:render:integration` starts the actual production server against a temporary database to test product publishing, checkout gates, delivery, and restart persistence. It never uses real provider keys. With the environment variables above set, run `npm run start:render`. The start command optionally loads the ignored `.env.render.local`; Render's actual environment takes precedence. Local testing permits `APP_ORIGIN=http://localhost:10000`; Render requires HTTPS. Local preview identity cookies are never accepted by the production server.

Stripe credentials for local use belong only in ignored `.env.render.local`, not in `render.yaml` or version control. Enter the secret directly in Render when importing the Blueprint. Hosted Stripe Checkout does not need a publishable key in the frontend. Stripe webhook signing secrets start with `whsec_` and are separate from API keys.

The default `npm run dev` and `npm run build` continue to use the existing Sites/Cloudflare target. Both targets share source and the `dist` output directory; run the appropriate build before starting a target. The Render start command checks a build marker to prevent starting a Worker artifact accidentally.

References: [Render Blueprint fields](https://render.com/docs/blueprint-spec), [persistent disk restrictions](https://render.com/docs/disks), [Google OpenID Connect setup](https://developers.google.com/identity/openid-connect/openid-connect).

## Customer experience release

See [customer-experience.md](customer-experience.md) for course uploads, communities, booking and free-guide funnels, CRM metrics, referral terms, and Resend setup. Add `charge.refunded` and `charge.dispute.created` to the connected-account sales webhook before enabling referral partnerships. Optional server settings: `RESEND_API_KEY` and `EMAIL_FROM`; the sender must be verified with Resend.
