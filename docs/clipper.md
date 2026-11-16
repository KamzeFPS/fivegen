# FiveGen Clipper

FiveGen Clipper adds a bilingual campaign marketplace to the existing FiveGen application and persistent database. Mongolian is the default; append `?lang=en` for English or `?lang=mn` for Mongolian.

| Destination | Route |
| --- | --- |
| Public landing | `https://clipper.fivegen.ai/` |
| Landing on the main domain | `https://www.fivegen.ai/clipper` |
| Creator workspace | `https://www.fivegen.ai/clipper/app` |
| Administration | `https://www.fivegen.ai/clipper/admin` |

The public subdomain does not receive application credentials or accept mutations. Member/admin destinations redirect to the canonical `APP_ORIGIN` and retain the language query through the existing Google/email sign-in and terms flow. Sessions remain host-only. Admin access uses the existing `ADMIN_USER_IDS` and `ADMIN_EMAILS` allowlists.

## Campaign operation

1. An admin creates a campaign with Mongolian and English title, description, brief and requirements. Set brand/category, eligible platforms, currency, CPM or per-post reward, minimum/maximum reward, total budget, optional dates, and HTTPS cover/reference links.
2. Save as a private draft or publish with **Open** status. **Paused** and **Closed** stop new joins/submissions. Published campaigns cannot return to draft. Scheduled campaigns accept work only within their configured dates; the admin date editor uses Asia/Ulaanbaatar (UTC+8).
3. A creator signs in, saves a display name and at least one public social profile, then joins an open campaign. Joining is idempotent. Reward terms and eligible platforms become fixed after the first creator joins; admins can increase the budget and edit campaign copy/status.
4. Creators submit public TikTok videos, Instagram reels/posts or YouTube videos. Membership, eligible platform, dates, remaining budget and a 50-submission rolling daily limit are checked in the write. Platform media IDs prevent duplicate submissions across handles, URL forms, campaigns and accounts.
5. An admin opens the post, manually verifies the requirements/views, and approves or rejects the pending submission. Rejection requires a reason. Decisions are final in this release. CPM rewards are rounded down to minor units and capped per clip; an approval below the minimum reward is rejected. Database guards prevent approved rewards from exceeding the campaign budget, including concurrent reviews.

**Approved rewards are accounting records, not completed transfers.** There is no automated social-account verification, view polling, fraud service or payout integration. Admins arrange payment separately. The interface distinguishes pending, approved and rejected submissions and explains the manual payment boundary. Campaign creation currently accepts cover/reference URLs rather than binary file uploads.

No campaigns or people are seeded in production. Public responses exclude private profiles/submissions; creators see only their own records. Writes require an authenticated user, accepted terms and same-origin requests; admin writes also require the allowlist. Success and error responses use `private, no-store`.

## API and storage

`GET /api/clipper` returns public campaigns plus the signed-in creator's profile, memberships and submissions. Profile updates use `PUT /api/clipper/profile`; campaign join/submission actions use `/api/clipper/campaigns/:id/join` and `/submissions`. Admin reads, campaign creation/updates and reviews live below `/api/clipper/admin`.

All API money values are integer **minor units** for both USD and MNT: `1250` means USD 12.50 or MNT 12.50, depending on `currency`. UI forms accept currency amounts and convert by 100. API dates are epoch milliseconds or `null`; campaign updates require `expectedVersion`. JSON bodies are limited to 96,000 bytes. Campaign assets require HTTPS links without embedded credentials.

Migration `0063_clipper.sql` adds campaigns, creator profiles, memberships and submissions without altering existing FiveGen product or billing data. Reward totals are maintained by a database trigger, with a separate trigger enforcing the total budget. Keep the persistent database and migration history. Current list bounds are 500 campaigns/member records and 1,000 admin submissions, with pending submissions listed before reviewed history; add pagination before operating at higher volume.

## Deployment and verification

Use the existing Render service, disk, `APP_ORIGIN` and OAuth callback. `CLIPPER_ORIGIN=https://clipper.fivegen.ai` identifies the public host; FiveGen production also recognizes this hostname by default. Configure its custom-domain/wildcard DNS and TLS on that service before announcing the subdomain live. See [Render clipping-host setup](render.md#clipping-subdomain).

```powershell
npm run build:render
node scripts/clipper-test.mjs
node scripts/clipper-host-test.mjs
node scripts/clipper-runtime-test.mjs
npx tsc --noEmit
```

For a local synthetic visual preview after building, run `node scripts/clipper-preview.mjs`. It creates a fresh isolated database, disables external network effects, and prints the local landing/member/admin URLs. Fixture campaigns, people, views and money are demonstrations only. The runtime test exercises the built HTTP/auth boundary and database without sending email, posting clips or making payments.
