# FiveGen — Digital Product Studio

FiveGen is a full-stack creator workspace for generating, editing, publishing, and selling digital products. The interface includes an overview, product editor, templates, revenue analytics, customers, payments, AI providers, and workspace settings.

## What works

- Authenticated, account-scoped product storage in Cloudflare D1; public storefront routes at `/p/{slug}`.
- OpenAI Responses and Anthropic Messages adapters with selectable models and encrypted per-account API keys.
- Resumable staged generation: product architecture, individual finished sections, supporting files, sales copy, launch emails, social posts, and image/video creative direction.
- Creator-provided language, quality/depth, custom instructions, and arbitrary product briefs. Custom products can produce text, Markdown, CSV, HTML tools, JSON, JavaScript, CSS, and Python resources. Generated code is downloaded, never executed on the server.
- Individual section refinement with optimistic concurrency protection.
- fal.ai FLUX 1.1 Pro Ultra image generation and Kling 2.6 Pro five-second video generation with native audio. Queue IDs persist; assets are copied to private R2 storage on completion. A campaign button queues three image formats and one video.
- HTML guide export (print to PDF), Markdown, a ZIP product bundle, and individual supporting-file downloads. Generated media downloads separately from the asset library.
- Stripe Connect Standard onboarding, connected-account checkout, signed webhook verification, idempotent sale recording, and purchase-gated ZIP delivery.
- Existing Whop checkout links on storefronts. Whop payments, delivery, refunds, and reporting remain in Whop; native Whop payment synchronization is not implemented.
- Revenue totals, charts, date ranges, customer records, and CSV export derived from recorded Stripe orders. Sample data is clearly labeled and separate from persisted sales. Gross revenue is not net of fees or refunds.

## Activation

1. `CREDENTIAL_ENCRYPTION_KEY` must be a stable random server secret. It is already configured for this Site and in the ignored local environment. Do not rotate it without migrating encrypted keys.
2. Sign in and open **AI providers**. Add an OpenAI or Anthropic API key for content, and a fal.ai API key for images and videos. The keys are encrypted with AES-GCM and account-bound additional data, and never returned from the settings API.
3. For payments, the platform owner must configure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in the hosted Site environment. Configure a **connected-account** Stripe webhook at `/api/webhooks/stripe` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Each creator then uses **Payments → Connect Stripe**. Use test credentials and verify a purchase before switching to live payments.
4. The default product URL is `/p/{slug}`. For `product.yourdomain.com`, supply a domain you own, configure wildcard DNS and hosting, and set the server environment `PRODUCT_DOMAIN`. The middleware rewrites recognized product subdomains. Wildcard domain provisioning has not been performed.
5. Product storefronts are externally shareable only when the Site's access permits public visitors. The creator workspace and write APIs require sign-in and enforce ownership independently of Site visibility.

## Scope and operational limits

No AI keys or payment account credentials were supplied during implementation, so real model outputs, media quality, billing, and live purchases have not been end-to-end tested. The app fails clearly on missing credentials; structured starter content is explicitly labeled and does not pretend to be an AI result. Output quality depends on the brief, selected model, and editorial review.

Text generation proceeds while the product editor is open, saves after every stage, and can be resumed after a refresh or failure. In-flight requests have a lease to prevent concurrent runs. Media processing runs at the provider; reopening the asset library resumes status collection. This is not an always-running background job service. Provider keys are required for subsequent polling.

This implementation does not provide native proprietary formats, rendered PPTX/DOCX, actual Notion databases, long-form video editing, automatic tax/accounting, subscriptions, refund reconciliation, or a billing plan for the FiveGen platform. Custom generated HTML tools and code should be reviewed and tested before resale. No guaranteed outcome or revenue is implied.

## Validation

Type checking and the production Worker build pass. `scripts/smoke-test.mjs` exercises local sign-in, authorization, CSRF checks, product creation, publishing, paid-content isolation, free ZIP delivery, escaped HTML export, unavailable-provider errors, encrypted key storage, and unpublishing. Run it only against an isolated local development database with no real provider keys. This script never sends a real generation or payment request.

## Development runtime

A clean full-stack starter running on [vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Windows, macOS, or Linux; Git is required only for publishing, and Bash is not required for initialization or the project commands

## Sites Lifecycle

The bundled Sites initializer copies this starter into the project and runs its locked dependency install before returning the checkout. Edit the source under `app/`, use `npm run dev` for the Codex local preview, and run the project validation before hosting. The remote Sites builder also runs `npm run build` against the pushed commit. Do not rerun the dependency install unless dependencies are absent or the lockfile changed.

This starter does not use `wrangler.jsonc`.

`install:ci` runs `npm ci` once against this checkout's bundled lockfile, explicitly targeting the project and disabling parent-workspace discovery. It includes dev and optional dependencies required for builds and previews even when production/omit settings would exclude them. It defaults Sharp to prebuilt binaries unless the caller explicitly configures Sharp or a source build. It uses `--prefer-offline --no-audit --no-fund`, reuses the configured npm cache, and leaves network concurrency, retries, timeouts, and lifecycle-script policy to npm's configuration. Retain the installer session until it finishes; do not overlap installers for the same checkout.

`scripts/sites-env.mjs` preserves the caller's HOME, npm cache, proxy, XDG, and temporary-directory configuration while defaulting Wrangler and Miniflare state to the checkout. If npm reports an unwritable cache, select a writable path with `npm_config_cache` for that install. The `dev` and `start` scripts also keep Wrangler logs inside the checkout. Generated `.sites-runtime/` and `.wrangler/` directories are disposable and ignored by Git.

`npm run dev` uses `vinext dev` for the live Vite preview with HMR, starting at port 5173. Vinext records the running server in ignored `.vinext/` state and rejects another start for the same checkout while that process is alive; reuse its printed URL. It recovers stale state after a stopped process. Pass `--port <port>` or `--hostname <host>` after `npm run dev --` when needed; keep Codex previews on loopback. Like the Sites package, this relies on Vinext's advisory lock; exactly simultaneous starts can race.

The bundled Sites Vite plugin simulates ChatGPT sign-in only for loopback development requests. Visit `/signin-with-chatgpt?return_to=/` to sign in as `local_seedy` (`seedy@sites.test`, display name `Seedy`) and `/signout-with-chatgpt?return_to=/` to sign out. The development cookie preserves that identity across server restarts. This does not exercise real ChatGPT OAuth and is not included in production builds; hosted authentication remains dispatch-owned.

The Worker uses `vinext/server/fetch-handler`, including Vinext's config-aware image handling. After building, `npm start` runs that Worker locally through Wrangler on `127.0.0.1`, sharing `.wrangler/state` with dev preview and local D1 migrations; it does not deploy the site or simulate sign-in. Use the URL printed by the server. Pass `npm start -- --port <port>` to select a different built-preview port.

Local previews use Miniflare's placeholder `Request.cf` metadata without a network lookup. Set `CLOUDFLARE_CF_FETCH_ENABLED=true` to opt into fetching preview metadata; this setting does not change hosted request metadata.

Local tool usage metrics are disabled by default. Set `WRANGLER_SEND_METRICS=true` to opt in.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `@cloudflare/workers-types` provides Worker types; `cloudflare-env.d.ts` declares optional `DB`/`BUCKET` bindings—update these declarations if binding names change
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Use it as the durable user key; use email and name for display or contact purposes.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get(
    "oai-authenticated-user-full-name",
  );
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use the returned `userId` as the stable user key for user-owned records; do not use email as a durable identifier.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Local D1 migrations

For a D1-backed local preview, generate SQL with `npm run db:generate`. Build once through the Sites skill's build entrypoint (or `npm run build` for standalone use) to generate `dist/server/wrangler.json`, rebuilding if bindings change. From the project root, apply each pending migration in order:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_example.sql
```

Replace the filename with the pending migration and `DB` with your D1 binding name if different. Use `.wrangler/state`, not `.wrangler/state/v3`; Wrangler adds the versioned directories. Do not replay migrations already applied locally. This updates only the preview database; publishing applies production migrations separately.

## Diagnostic Commands

- `npm run install:ci`: perform the one locked dependency install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: preview the built Worker locally with D1/R2 support
- `npm run db:generate`: generate Drizzle migrations after schema changes

When using the Sites plugin, follow its skill instructions for installation, builds, and publishing. These npm commands remain available for standalone use.

Like the Sites package, `npm run build` runs `vinext build` directly; it does not require a host `timeout` command.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
