# FiveGen — AI Creation Studio

FiveGen is a private workspace for turning ideas into downloadable digital products. An AI planning conversation defines the audience, scope and usable deliverables; the creator then explicitly starts generation and reviews the saved content, supporting files and optional credit-powered visuals.

## Current product

- Private account-scoped projects, persisted planning conversations and a responsive dark/orange editor.
- Guides, mini courses, template kits, challenges, playbooks and custom tools. Each generation uses the agreed brief, format-specific instructions and the account's recent product context.
- Real OpenAI or Anthropic content generation through administrator-managed credentials. OpenAI planning and staged generation use validated structured output.
- Saved, resumable content generation; individual edits and supporting files; ZIP downloads containing Markdown, print-ready HTML and actual resources. Print the HTML to PDF in a browser. Native DOCX/PPTX/Notion exports are not provided.
- Optional fal.ai images and short videos, charged separately. Marketing prompts are not represented as generated visuals.
- OAuth-based MCP access for connected assistants, with scoped permissions and explicit credit limits.
- Paddle billing for FiveGen subscriptions and one-time AI credit packs. Public Terms, Privacy and Refund policies are linked from the workspace and pricing page.

New storefront publishing, buyer checkout, Stripe Connect onboarding, funnels, CRM, referral links and seller payouts are retired. Their public/API entry points return 410. Historical payments, webhooks, customer records and paid download entitlements are retained for fulfillment and support. Old commerce source files and documents describe legacy behavior; they are not current product capabilities.

## Plans and credits

Every account receives 3 complete AI product runs and 20 planning messages per UTC month. Manual editing and downloads are free. Additional content costs 10 credits per OpenAI step or 30 per Anthropic step. Images cost 12 credits and 5-second videos with audio cost 160.

Recommended subscriptions are Pro at $29/month or $290/year with 2,500 credits released monthly, and Studio at $69/month or $690/year with 6,000 credits released monthly. Subscription credits expire monthly; one-time purchased credits do not expire. The existing packs remain 1,000/$15, 2,500/$35 and 6,000/$75. Annual plans never release twelve months of credits upfront. See [studio release notes](docs/creation-studio.md) and [sandbox catalog IDs](docs/paddle-subscriptions-sandbox.json).

## Run and configure

Use Node 24.13+. Run npm ci, npm run build:render, then npm run start:render with private settings in .env.render.local. Production uses Render and a persistent SQLite/media disk; see [Render setup](docs/render.md). The optional Sites/Cloudflare target remains available through npm run dev and npm run build.

Only administrators supply master AI credentials. Never commit env files or expose server API keys to the client. Paddle environment is explicit, sandbox balances cannot buy real AI capacity, and live checkout remains locked until the operator completes Paddle verification and domain approval. Preserve all Paddle products, prices, destinations, secrets, customers, subscriptions and transactions.

## Validation

Run npx tsc --noEmit, npm run build:render, npm run test:credits, npm run test:studio, npm run test:paddle and npm run test:paddle:live. After building, node scripts/paddle-runtime-test.mjs checks real Node auth, webhook signatures, account rendering and the retired-commerce boundary. The older journey/commerce integration tests target historical functionality.

The explicit local-only studio-preview.mjs harness uses a separate retained SQLite directory and a fixture sign-in. It never runs in production and does not fake AI results. See the release notes for actual browser checks and remaining provider or payment verification requirements.
