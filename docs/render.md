# Deploy FiveGen with a Render Blueprint

`render.yaml` runs FiveGen as a production Node service. It uses a paid single instance in Singapore and a 10 GB persistent disk for SQLite and private media. It does not run a Vite development server or Wrangler emulation. The existing Sites build remains available with `npm run build`.

## Before creating the Blueprint

1. Put this checkout in a GitHub, GitLab, or Bitbucket repository that your Render account can access. The current Sites source repository is not automatically linked to Render. Keep `.dev.vars`, `.env*`, `.wrangler`, and `outputs` out of the repository.
2. Create a **Web application** OAuth client in Google Cloud, configure its consent screen, and obtain `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Render sign-in uses Google; Sites-specific sign-in cannot run on another host. In Google, add the exact authorized redirect URI `https://YOUR-RENDER-HOST/callback` once Render assigns the hostname. If using a custom domain, use that domain instead and set `APP_ORIGIN` to its HTTPS origin. Publish the Google consent app for external users, or add your test users while it is in testing.
3. In Render, choose **New → Blueprint**, select that repository, and use the root `render.yaml`. Enter the two Google credentials and your Stripe secret key when prompted. Render generates `CREDENTIAL_ENCRYPTION_KEY`; preserve it for the lifetime of the database and include it in secure disaster recovery. Review the paid service and disk costs before creating resources.
4. Deploy. The start command applies each SQL migration exactly once, checks existing migration checksums, and then starts the public server on `0.0.0.0:$PORT`. Migrations run at startup because Render does not mount service disks during build or pre-deploy commands. `/healthz` verifies database access and available disk space.

The Blueprint deliberately leaves automatic deployment off. Enable it in Render after the first verified release if desired.

## Enable payments and AI

- Sign in as `kamzewac@gmail.com` to access FiveGen administration. Admin access requires a Google-verified email, not an email typed into a form. For an alternate administrator, update `ADMIN_EMAILS` in Render.
- Add the shared OpenAI/Anthropic and fal.ai keys in FiveGen's administrator settings. Alternatively, use the server environment variables `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `FAL_KEY`. Ordinary customers never supply keys.
- Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `STRIPE_BILLING_WEBHOOK_SECRET` in Render Environment. Both Stripe webhook destinations use `https://YOUR-HOST/api/webhooks/stripe`: one for connected-account sales and one for platform subscriptions/credit purchases. Use the event lists in [monetization.md](monetization.md) and [commerce.md](commerce.md), then validate test-mode payments before enabling live payments.
- Creators connect their Stripe accounts in **Payments**. Free remains 10 products and a 10% commission; Pro remains a 3% commission. Stripe is the only payment provider.
- The MCP URL becomes `https://YOUR-HOST/api/mcp`; discovery and authorization use the Render origin automatically. Reconnect Claude/ChatGPT to this new URL.

Optional environment variables: `APP_ORIGIN` (canonical custom-domain origin), `PRODUCT_DOMAIN` (configured wildcard product domain), `AI_DAILY_BUDGET_USD`, and the secrets above. `RENDER_EXTERNAL_URL` supplies the default origin. Never expose secrets through `NEXT_PUBLIC_` variables. The Render runtime refuses to start without sign-in credentials, persistent storage configuration, and an encryption key of at least 32 characters.

## Data and operations

This is a **new, empty deployment**. Sites products, orders, credit balances, provider settings, media, customer access tokens, and MCP connections are not copied automatically. Google account IDs differ from Sites account IDs. Moving the existing business requires an explicit database/media export, preservation of the existing encryption key, ownership mapping, and a planned Stripe webhook/domain cutover. Do not direct existing customers to the new instance until that migration is complete.

Only files under `/var/data/fivegen` persist. The SQLite database, WAL, media files, and sign-in state all live there. Do not remove the disk or use a free/ephemeral service. Keep a single instance; this deployment cannot horizontally scale with a local disk. Restarting/deploying a disk-backed service involves brief downtime. Configure independent backups of the database and media before accepting live sales, and monitor disk usage as generated video accumulates.

## Local validation

Use Node 24.13 or newer. `npm run build:render` builds the Node target, and `npm run test:render` verifies migrations, persistence, transaction rollback, private media, OAuth protections, and header spoofing. `npm run test:render:integration` starts the actual production server against a temporary database to test product publishing, checkout gates, delivery, and restart persistence. It never uses real provider keys. With the environment variables above set, run `npm run start:render`. The start command optionally loads the ignored `.env.render.local`; Render's actual environment takes precedence. Local testing permits `APP_ORIGIN=http://localhost:10000`; Render requires HTTPS. Local preview identity cookies are never accepted by the production server.

The supplied Stripe test secret and publishable key are stored only in ignored `.env.render.local`, not in `render.yaml` or version control. Enter the secret directly in Render when importing the Blueprint. Hosted Stripe Checkout does not need a publishable key in the frontend. Stripe webhook signing secrets start with `whsec_` and are separate from API keys.

The default `npm run dev` and `npm run build` continue to use the existing Sites/Cloudflare target. Both targets share source and the `dist` output directory; run the appropriate build before starting a target. The Render start command checks a build marker to prevent starting a Worker artifact accidentally.

References: [Render Blueprint fields](https://render.com/docs/blueprint-spec), [persistent disk restrictions](https://render.com/docs/disks), [Google OpenID Connect setup](https://developers.google.com/identity/openid-connect/openid-connect).
