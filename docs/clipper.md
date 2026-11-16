# FiveGen Clipper

Mongolian is the default; use `?lang=en` for English. The landing is at `https://clipper.fivegen.ai/`. Member and admin pages use the existing host-only FiveGen sign-in at `/clipper/app` and `/clipper/admin` on canonical `APP_ORIGIN`.

## Upload and approval

1. Admins create bilingual campaigns with creative instructions, reward terms, budgets and eligible publishing platforms.
2. A signed-in clipper chooses a campaign and uploads an original **MP4 video, up to 100 MB**. No personal social account, public post URL, profile setup or separate join step is required. The server creates the clipper profile and campaign membership as needed.
3. Uploads remain private. Only the submitter and FiveGen admins can play a completed upload. The original bytes, filename, size and SHA-256 are saved in private storage. MP4 structure, declared/received size and stored integrity are checked. This is structural validation, not a malware scan or codec transcoding service. Accounts have a 2 GB storage allowance and 50 upload attempts per rolling day.
4. An admin reviews playback, writes the public caption and selects the exact configured platform accounts. **Approve & publish** atomically saves approval and one durable publishing job. Rejecting records a reason and never creates a publishing job.
5. The worker submits the approved video automatically, then records per-platform status and public links. Approval, queued publication and confirmed publication are separate states. Partially completed jobs continue polling remaining platforms. An ambiguous provider reply is reconciled against saved post identity/history; it is never blindly uploaded again.

Legacy post-link submissions remain readable for history, but the old link-submission endpoint rejects new entries. Migration `0064` preserves existing submissions and rewards while introducing private videos. Do not change the already deployed `0063` migration.

## Admin publishing credentials

Open **Admin → Social publishing**. This release uses the separately configured [Ayrshare publishing API](https://www.ayrshare.com/docs/apis/post/overview) for Instagram, TikTok and YouTube. The admin needs an appropriate Ayrshare account/plan and links the owned destination accounts in the [Ayrshare dashboard](https://app.ayrshare.com/). No subscription or account is created by FiveGen.

Enter the Ayrshare API key and, if applicable, its Business profile key in FiveGen's admin form. Select enabled platforms and save. FiveGen verifies linked account identities before storing settings. Credentials are encrypted with the existing `CREDENTIAL_ENCRYPTION_KEY`, are never returned by APIs, and do not enter browser storage. A failed replacement leaves the previous verified configuration intact.

Approval is blocked until the selected destinations are configured and verified. Each job snapshots the chosen account IDs, caption and credentials. Changed destination accounts/settings hold an unsent job for review instead of publishing somewhere else. Posts use public visibility. Platform-specific eligibility and media requirements still apply; uploads are not transcoded. Failed/ambiguous jobs direct the admin to provider history to avoid duplicate public posts.

An approved file gets a seven-day, token-protected media URL on the canonical FiveGen host so the provider can fetch it. Tokens are hashed/encrypted in storage, excluded from API projections, and scoped to an approved completed upload. Private upload playback requires account authorization and supports range requests.

## Rewards

Per-post approval allocates the campaign's fixed reward, subject to the existing database budget guard. CPM views are unknown at approval time, so video publication does not fabricate a view count or CPM reward. Legacy verified-view accounting remains intact. No automatic view polling or money transfer is included; admins arrange payments separately.

## Operations and validation

The existing Render process runs a publishing worker once per minute. `CLIPPER_PUBLISHING_WORKER_ENABLED=false` pauses automatic dispatch. A process-only `CLIPPER_PUBLISHING_DISPATCH_SECRET` protects its loopback endpoint. Jobs, provider identities, leases and credentials persist in SQLite across restarts. Migration `0065` adds publishing settings/jobs without altering product or billing data.

All writes require accepted terms and same-origin requests; admin operations also require the existing allowlist. Success/error/private media responses are not shared-cacheable. The public clipper subdomain strips application credentials and forwards member/admin work to the canonical host.

```powershell
npm run build:render
npm run test:clipper
npm run test:clipper:integration
npx tsc --noEmit
```

The integration tests upload a locally generated synthetic MP4 and simulate provider requests. They never post to real social accounts, send email, or make payments. Production publishing must be verified after an admin supplies real credentials and linked accounts. Current list bounds remain 500 campaigns/member records and 1,000 admin submissions, with pending reviews first.
