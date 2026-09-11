# FiveGen MCP

FiveGen exposes a real, authenticated Streamable HTTP MCP server at `/api/mcp`. It uses the official `@modelcontextprotocol/sdk` and works with compatible remote MCP clients. It is separate from browser WebMCP.

## Deployment status and activation

The owner explicitly approved public access on September 11, 2026. The Site now allows external OAuth discovery without a browser session. Live, unauthenticated checks return HTTP 200 JSON for the protected-resource and authorization-server metadata, and `/api/mcp` returns the expected HTTP 401 JSON with its OAuth discovery challenge. Workspace and admin APIs continue to return HTTP 401 without authentication. The application implementation and local OAuth/MCP flow are tested; a connection inside the actual Claude or ChatGPT product has not been verified.

Do not distribute Sites bypass tokens to users or AI clients. Preserve the approved public audience. Published product/funnel pages are publicly reachable, while workspace APIs and MCP tools enforce authentication and ownership. The previous owner-private audience blocked discovery with a hosting-level HTML 401; switching to public access resolved that failure.

The Sites connector can report platform-managed MCP connection details for publications that declare native MCP support, but the installed Sites skills do not document that declaration. No unsupported hosting manifest fields were guessed or added.

Sites reserves `/mcp` for its native MCP publication feature; an undeclared publication returns a hosting-level 404 there. This application uses `/api/mcp` for its own authenticated MCP server. A public-audience change must be followed by a no-cookie discovery/protocol test before claiming web-client activation.

Use `https://folio-product-studio.kamzewac.chatgpt.site/api/mcp`. The **Connect AI** dashboard view has the endpoint, setup guidance, live connection list, revoke buttons, activity and generation prices. If an earlier connection attempt failed during OAuth discovery, retry it with this same URL.

## Authentication

OAuth authorization-code flow with mandatory S256 PKCE, dynamic public-client registration, RFC 9728 protected-resource discovery, issuer identification, exact registered redirect matching and resource binding. Browser consent uses the existing Sites sign-in identity. No separate customer passwords or AI provider keys are introduced.

- `/.well-known/oauth-protected-resource` and `/api/mcp` resource suffix expose metadata.
- `/.well-known/oauth-authorization-server` exposes authorization-server metadata.
- `/oauth/register`, `/oauth/authorize`, `/oauth/consent`, `/oauth/token`, `/oauth/revoke` implement connection authorization.
- Well-known URLs rewrite to ordinary route directories because Vinext excludes dot-prefixed route directories.
- Authorization codes expire in two minutes and can be exchanged once.
- Access tokens expire in one hour. Refresh credentials rotate once per use and expire thirty days after initial authorization.
- Only SHA-256 hashes of usable codes/tokens are stored. HMAC-signed, ten-minute consent tickets bind the request to the signed-in user; POST consent also requires the exact same Origin.
- Revocation prevents further MCP requests and refreshes immediately. An already running authorized action may finish.
- `CREDENTIAL_ENCRYPTION_KEY` is required for consent signing. `MCP_ORIGIN` can override the canonical HTTPS origin after a domain migration. Loopback development uses its local origin.
- Dynamic registration allows HTTPS callbacks or explicit loopback HTTP callbacks, rejects fragments/credentials, and is limited to 200 registrations per hour globally.

Four separately granted permissions: `products:read`, `products:write`, `ai:generate`, `products:publish`. Read and draft editing are checked by default. Credit spending and publishing are unchecked consent choices. Never pass app admin privileges or provider credentials through MCP.

## Workflow and tools

Start with `get_workspace` and `list_products`. `create_product` uses a product slot and creates a draft without calling a paid model. Claude/ChatGPT can author the content itself and send complete sections, files and marketing copy using `save_product`; this spends no FiveGen AI credits.

The 14 tools are:

- `get_workspace`, `list_products`, `get_product`
- `create_product`, `save_product`, `set_product_visibility`
- `get_generation_status`, `generate_product_step`, `stop_generation`, `revise_product_section`
- `list_assets`, `generate_marketing_asset`, `sync_marketing_asset`, `get_download_links`

`save_product.changes.commerce` supports the existing recurring billing, BOGO/bundle/bonus/discount deals, upsells, and customizable funnel blocks. The existing Pro gates and related-product ownership checks apply. Nested content/commerce objects replace those whole objects, so callers must preserve sections/blocks they intend to keep. `get_product` supplies full editable values. Publishing and live editing require publishing permission; revision checks reject stale updates.

AI generation uses master providers, wallet reservations, refunds, platform spending caps, and three included product runs per UTC month. There are no plan restrictions. Included product steps can use `maxCredits:0` and `confirmSpend:false`; a paid call requires `confirmSpend:true` and `maxCredits`. Actual reservations enforce that budget through request-scoped async context, including if the administrator changes provider prices between the assistant's read and generation. No tool buys credits, subscribes a customer, changes payout settings, reads customer contact details, or configures admin secrets. The creator must accept the current terms in the FiveGen web app before using connected workspace tools.

Text generation advances one stage per call, avoiding a long-running all-or-nothing HTTP request. Use a fresh operation ID for each intended stage and inspect status before proceeding. Media is queued; poll `sync_marketing_asset` to retrieve and store completion. The usual Free 10-product/10% and Pro 100-product/3% policies remain in effect.

Mutation tools require a stable `requestId` (except naturally repeatable asset sync). D1 atomically claims each operation; exact retries return the prior result and conflicting reuse is rejected. A running/uncertain operation is never retried blindly. Read state first. The operation ledger is also the customer-visible activity log. Content editing/publishing requires `expectedUpdatedAt` and uses a conditional SQL update to avoid lost edits.

Tools call the same application handlers directly under an AsyncLocalStorage identity set only after token verification. They never forward spoofed identity headers or arbitrary API paths. Every product and asset operation still checks ownership. Read results omit customer contact details and payment/provider credentials. Download URLs require the signed-in browser; they are not purchaser delivery capabilities.

## Client setup

To connect:

1. **Claude:** Customize → Connectors → Add custom connector. Name it FiveGen and paste the MCP URL. Use OAuth and sign in to the same FiveGen account. Organization policy may require an owner to add the connector.
2. **ChatGPT:** enable developer mode under Settings → Security and login if available. Add a connection in ChatGPT Plugins, enter the MCP URL, and authorize FiveGen. Availability is account/workspace dependent.
3. Review permissions. Start with reading and draft editing; enable paid generation/publishing only when wanted.
4. Try: “Create a practical first-client playbook for freelance designers. Write the chapters, add a pricing calculator and prepare the launch campaign. Save it as a draft in FiveGen for my review.”
5. Disconnect in FiveGen → Connect AI to revoke the connection, even if the assistant still retains its old token.

Official references checked September 11, 2026:

- [MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server)
- [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)
- [OpenAI authentication requirements](https://developers.openai.com/plugins/build/auth)
- [Connect and test in ChatGPT](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Claude remote custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

## Verification

Apply migration `0003_past_doctor_doom.sql` locally, run the app on port 5173, then:

```text
node scripts/mcp-test.mjs
node --experimental-strip-types scripts/credits-test.mjs
node --experimental-strip-types scripts/commission-test.mjs
node scripts/credit-access-test.mjs
node --experimental-strip-types scripts/commerce-integration-test.mjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vinext/dist/cli.js build
```

The integration test uses the actual MCP SDK client and local HTTP server. It covers discovery, consent, PKCE rejection, single-use codes, token hashing, rotation/revocation, all-user isolation, retry deduplication, stale edits, workspace permissions, and a create → edit → publish → public-page readback journey. Temporary local products, OAuth clients/connections and operation records are removed. It never starts a paid provider request. Existing credit tests exercise actual reservation SQL and the MCP per-call spending ceiling.

Production OAuth/MCP discovery and authentication boundaries passed no-cookie HTTP checks after public activation. A real end-user Claude/ChatGPT connection remains a client-side verification step, not a claimed passing test.
