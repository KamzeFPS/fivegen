# Workspace domain hosting

Creators manage names and product paths in **Library → Domains**. Saving a path
never publishes a private product. URLs resolve only to current, nonarchived,
explicitly published page snapshots belonging to that workspace.

## First-party addresses

`FIVEGEN_WORKSPACE_DOMAIN` is the operator-owned base domain, defaulting to
`fivegen.ai`. Set it to `fivegen.com` only after that domain is owned and connected
to the same service. A creator chooses a unique available label such as `aagii`
or `xyz`; reserved infrastructure names cannot be claimed.

`FIVEGEN_WORKSPACE_SUBDOMAINS_READY=true` is a trusted operator assertion that
wildcard hosting, DNS and HTTPS are active for the configured base. Leave it unset
until those prerequisites pass. Claims are saved while pending, but the app does
not present them as working public URLs.

On Render, add the root and wildcard domain to the existing service, configure
the exact records shown by Render, and verify its certificate before enabling
the flag. Current Render guidance requires the root to point to Render and three
wildcard CNAME records: `*`, `_acme-challenge` and `_cf-custom-hostname`. Do not
guess their values or replace an existing website's records without reviewing
the intended routing.

Source: [Render custom domains](https://render.com/docs/custom-domains).

## Creator-owned domains

Custom domains reuse the catalog's unique hostname and per-claim TXT ownership
token. The creator adds its displayed TXT/CNAME records and checks DNS. Passing
DNS is separate from platform hosting and TLS approval. A trusted operator must
associate that exact hostname with the service and confirm HTTPS before setting
its `platform_status='connected'` and `tls_status='active'`. Do not grant either
state from creator input. The application does not expose those approvals to
ordinary account requests.

Domain routing serves only published public pages and their own public images.
Private uploads, account APIs, authenticated member content and POST actions are
not proxied through creator hosts. Account/member links return to the canonical
application origin. Existing payment and publication feature flags remain in
force; setting up a domain does not enable retired commerce or paid checkout.

The custom domain can serve individually published product paths even while its
catalog is private. `/` becomes available when the creator explicitly publishes
their catalog. Removing publication or archiving a product removes its mapped
route immediately. Restoring an archived product does not republish it.

## Changes and recovery

Domain/path saves use an atomic revision claim, tenant ownership checks and unique
names. A stale tab or archive race cannot replace another save. Existing canonical
FiveGen links stay available after changing a workspace prefix or disconnecting
a custom hostname. Creators should remove obsolete DNS records at their provider.

Local tests: `node scripts/workspace-domains-test.mjs`,
`node scripts/catalog-host-test.mjs`, and `node scripts/creator-catalog-test.mjs`.
