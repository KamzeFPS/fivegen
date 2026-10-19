# Existing-file sales: implementation record

Scope: local, additive implementation from the October 19 brief. No production publication, deploy, customer-data inspection, provider setup, emails, real charges or backfill is authorized. `screen_blueprint.md`, `sell_playbook_prototype.html` and `UX_AUDIT.md` were not supplied; only the pasted brief was present. Its observations are not represented as current test evidence.

## Discovery gate

The repository is React/Vinext with Next-style routes, a SQLite/D1 adapter and private R2-compatible storage. The active entry is `app/generator-studio.tsx`; the audited storefront editor is dormant. Manual creation defaults to Guide, forces price zero, and rejects selling changes. Render and middleware return 410 for the retired commerce routes. This differs materially from the handoff audit.

`app/api/products/[id]/uploads` already streams real PDF bytes to private storage (100 MB/file, 2 GB/workspace). The active Supporting files tab accepts authored text only. Existing upload validation trusts MIME and does not verify PDF bytes/digest. Buyer reads use product-wide access and current content, including later uploads. Checkout snapshots title/price/IDs only. Thus adding a draft course can leak its files, and checkout A followed by publication B cannot deliver immutable A using the old readers. No new storage framework is necessary.

Reuse: Product IDs/slugs, existing uploads/bucket, section/video models, Stripe Connect account read and checkout transport, checkout intents/orders, authenticated purchase-email recovery, owner checks, optimistic saves, SQLite atomic batches. New selling records opt in; legacy records are not converted. New private buyer access remains available when the selling entry flag is turned off.

Smallest dependency graph: PDF validation → draft module references → immutable published revision → pinned checkout intent → verified payment/order → revision-aware private access. Capability checks gate publish and each new checkout. Draft changes never change the live pointer. Publication and grant updates are atomic. Entry/UI depend on this complete boundary.

Additive migration 0016 creates draft/revision/grant/event tables, nullable intent/order revision references and upload validation metadata. No existing row is backfilled. Estimated changes cover one new editor, shared public/member views, new narrow sale APIs, existing upload/read boundary adapters, and isolated regression tests. Existing billing prices/credits and generation behavior stay unchanged.

## Requirement map

| Requirements | Reused / new boundary | Validation |
|---|---|---|
| FG-001,004,005,010 | generator entry, file-sale-studio; three-stage Product/Sell/Review; versioned draft API | File-first, save/resume, conflicts, errors, keyboard/mobile |
| FG-002,017,018 | product-presets, file-sale-contract; one Product, two supported modules | All preset mappings, unique modules, ordering, legacy labels |
| FG-003,009 | existing uploads/bucket; validation and revision-aware access | Real PDF signature/digest, interrupted transfer, foreign owner, correct bytes |
| FG-006 | file-sales backend, existing Stripe transport/checkout_intents/orders | Existing connected account only; capability states, sandbox, paid proof and replay |
| FG-007,008,011 | immutable revisions; shared page view; public `/p/[slug]` | Fresh checks, stale version, repeat publication, exact public link |
| FG-012,013,019,020 | grant adapter and private readers; feature flag | Draft exclusion, A checkout/B publish, paid file retention, explicit module grants |
| FG-014 | Existing optional marketing retained | Outside critical sale path; no new funnel/CRM engine |
| FG-015 | Existing platform-owned Resend settings | No verified sender/queue proof; email not promised or needed for access |
| FG-016 | Existing credit-policy and verified founder exception | No pricing or debit changes; manual selling consumes no AI credits |

## Decisions and limits

User decision: existing buyers receive future PDF updates; newly added modules require explicit approval. Implement as additive immutable revision grants to already-completed orders at publication. Pending checkout A remains pinned to A even if B publishes before payment. No grant or mutation rewrites the purchase facts. Removing a module preserves already-purchased access. Existing legacy products/orders retain their prior behavior; they are not silently enrolled in this policy.

The scoped offer is USD, one-time, with existing provider constraints. Stripe documents a USD 0.50 minimum in its [currency rules](https://docs.stripe.com/currencies#minimum-and-maximum-charge-amounts); the UI and server enforce it, rather than treating the audited product price as policy. Free offers, recurring seller offers, archives and automatic merchant onboarding are not exposed by this first slice. This is distinct from platform subscriptions/credit packs, which remain intact. Existing Stripe account setup/capability review is an external dependency, not a task to create accounts or bypass approval.

No supported automation/receipt queue was discovered. Resend key/sender-presence checks do not prove sender verification. The platform administrator owns those prerequisites. Buyer access uses confirmed payment plus secure session/private link and does not depend on email. No consent is inferred from buying, no sequence is activated, and no email is sent in this task.

## Type and module coverage

| Brief label | Stored format | New starter / actual capability | Remaining boundary |
|---|---|---|---|
| Video course | Mini course | Course, optional existing MP4/WebM attachment | No new video rendering or quiz engine |
| Mini course | Mini course | Same Course module, compact content | No required lesson count/video |
| Guide | Guide | Downloads | PDF validation/private delivery |
| Playbook | Playbook | Downloads | Same native PDF path |
| Template kit | Template kit | Downloads | No ZIP/archive/external-copy promise |
| Challenge | Challenge | Self-paced Course | Timed/cohort/drip unavailable |
| Custom | Custom product | Explicit Downloads or Course choice | Supported modules only |
| Consulting / Mentorship | Coaching session | Legacy booking code retained, not enabled by this slice | Scheduling and policy verification pending |
| Actual additional legacy value | Community | Existing protected code retained | No new community attachment/sale promise |

The current schema has eight values but they differ from the audit's eight labels. Presentation aliases preserve durable formats. Module attachment, draft readiness, offer inclusion, publication, and actual access are distinct. New module inclusion requires an explicit checkbox; adding Course does not change the price or published PDF. Unsupported modules are unavailable, not simulated.

## Rollout and rollback

Default flag off. Enable only on authorized isolated local/staging runtime with Stripe test mode. No production activation is included. Rollback turns off new entry/publish/checkout and leaves all revision, order, grant and upload records intact. Never delete paid artifacts, Paddle infrastructure or historical payment rows. No destructive down migration.

Before release: run retained synthetic-fixture regressions and build/type checks; inspect desktop/mobile flow; test a real authorized sandbox checkout with an eligible existing account; complete five real target-seller sessions (provisional 4/5 unassisted target). Provider fixtures are not real sandbox payment evidence; automated checks are not five usability participants. Record blockers and results below as work completes.

## Logical review boundaries

These are local review groups, not external PRs. All share the additive feature flag; no commit, push, production migration or deployment was performed.

| Group | Requirements | Main files / impact | Validation and rollback |
|---|---|---|---|
| Contracts and compatibility | FG-002/017/018 | `lib/product-presets.ts`, `lib/file-sale-contract.ts`, `db/schema.ts`, `drizzle/0016_file_sale_revisions.sql`, journal/snapshot | Eight persisted formats explicitly mapped; opt-in tables and nullable columns. Disable entry flag, retain schema and records. |
| Native assets | FG-003/009 | `lib/upload-validation.ts`, existing upload POST and upload GET/DELETE | Stream size/PDF structure/hash, private storage, ownership, protected deletion. No malware-scanning claim. Retain uploads on rollback. |
| Seller workspace | FG-001/004/005/010/018 | `app/file-sale-studio.tsx/.css`, `app/sell/[id]/page.tsx`, generator entry, workspace summary | Product → Sell → Review, actual file picker, explicit inclusion, lesson editing, keyboard reorder, save/resume. Disable entry without touching generation. |
| Checkout, revisions and access | FG-006/009/011/012/019/020 | `lib/file-sales.ts`, sale APIs, narrow `lib/payments.ts`/`lib/access.ts` adapters, private readers | Existing account capability checks, immutable checkout revision, verified payment, replay safety, additive PDF/module grants. Disable new purchases; preserve authorized historical reads. |
| Preview and share | FG-007/008/013 | `app/file-sale-page-view.tsx`, purchase component, `/p`, `/access`, runtime/middleware narrow route exception | Shared real page, server readiness, private buyer downloads, expired-link recovery. Only new opt-in test pages are enabled; prior retired routes stay retired. |
| Evidence and isolated preview | All release-critical boundaries | Three `scripts/*file*test.mjs` suites, PDF fixture, `scripts/file-sales-preview.mjs`, this report | Retained synthetic SQLite/bucket fixtures. Preview never loads existing env files, credentials or databases. |

## Verification results — October 19, 2026

**Passed locally:**

- `npm run test:file-sales`: all three suites passed against real isolated SQLite and private blob fixtures. Provider responses are explicitly synthetic. The webhook test uses the existing raw-body signature verifier with a synthetic secret and rejects tampered bytes.
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- Full Vite/Vinext RSC, server and browser production build via `scripts/file-sales-preview.mjs`: passed, with existing framework deprecation/chunk warnings. This bypasses dotenv loading deliberately; it is not a production deployment.
- `node scripts/commission-test.mjs`: passed for existing commission capture/renewal duplicate behavior. No financial policy changed.
- Drizzle snapshot reconciliation produced zero next-migration statements. `git diff --check` passed.
- A second agent reviewed publication and buyer-access boundaries. Its account-switch recovery finding was fixed; no other actionable paid-access regression was reported.
- Telemetry tests passed for sanitized payloads, idempotent completion events, deduplicated payment-readiness transitions and an actual SQLite publication rollback. Analytics-storage failures cannot fail saved drafts, committed publications or paid access. Public-page reads do not write readiness events.

### Automated coverage and limits

| Area | Verified | Not established by this evidence |
|---|---|---|
| Asset ingestion | Valid binary PDF, exact stored/downloaded bytes, MIME/extension mismatch, size/failed/interrupted processing, quota, foreign workspace denial, missing/corrupt object rejection | Antivirus, encrypted/malicious-PDF content analysis, production storage behavior |
| Draft and publication | Save/resume, stale version conflict, duplicate/concurrent requests, private Course alongside published PDF, incomplete included Course rejection, publication failure preserves previous revision | Real seller multi-tab/browser usability study |
| Payment | Disabled/unconfigured/disconnected/incomplete/pending/eligible/restricted states; fresh checks; unpaid refusal; verified synthetic webhook replay; A checkout → B publication → A completion | A real Stripe sandbox checkout, actual account eligibility, taxes/refunds/disputes reconciliation |
| Buyer access | Exact purchased revision; future PDF updates; original file retention; explicit Course grant; module removal retains access; unauthorized/draft/foreign files denied; byte ranges; rollback access | Real email receipt delivery, real customer identity-provider recovery |
| Legacy compatibility | Existing upload/member/ZIP behavior and unchanged rows in representative synthetic fixtures; legacy format adapter | All historic production URLs/orders. Retired `/p`, `/f` and legacy checkout routes were already 410 and are not globally resurrected. |
| Eight available starter variants | Playbook, Guide, Template kit, Mini course, Video course, self-paced Challenge, Custom Downloads and Custom Course each create/save/resume/publish/complete synthetic checkout/deliver | All eight brief labels fully sale-ready: Consulting remains unavailable; Community, timed cohorts/drip, ZIP archives and new service policies remain unsupported by this slice. |

### Browser walkthrough

Tested the built local application with a retained synthetic seller and a real, valid one-page PDF:

1. Uploaded the PDF through the browser file picker; saw actual upload/validation completion and filename-based title fill.
2. Added description, attached Course to the same Product, wrote a lesson, reordered modules using the keyboard, saved and reloaded both modules successfully.
3. Included Downloads in the offer while Course stayed private. Review showed only the PDF in the buyer-facing offer and an explicit excluded-Course change summary.
4. Confirmed one-time $19 pricing, positive ready checklist states and an exact unconfigured-payment blocker. Publish remained disabled.
5. Inspected a 390 × 844 viewport: no horizontal overflow (document width 375, viewport 390). Restored the normal viewport afterward.
6. Improved access recovery for expired cached links, blocked browser storage and a signed-in wrong-email account. The explicit account-switch action uses the existing Google account-selection flow. No real account sign-in or legal acceptance was performed.
7. Signed out the synthetic seller and observed access denial with retry, purchase-email and different-email recovery actions. Restored the synthetic session, downloaded the original PDF through the creator preview, and matched its SHA-256 to the uploaded file (`4831f49595ab8fd363ead25d9d5e929b5433b16bd66b1be346efd59afce1a823`). This browser check is creator access; paid-buyer access is covered by the isolated regression fixtures, not a real provider payment.

Retained visual evidence: `outputs/file-sale-browser-qa/05-final-review-desktop.png`, `04-product-mobile.png` and `06-access-recovery.png`. Local preview command: `npm run preview:file-sales`; its printed `/local-seller` entry signs into a synthetic fixture only. The preview intentionally cannot publish or take a payment without separately configured, eligible test infrastructure.

Retained regression evidence includes:

- `outputs/file-upload-qa/768ad6fd-96a3-4606-b642-4bac00b7390e`
- `outputs/file-sales-qa/bcfcae90-4bf9-4c57-bba0-f1623fe088e0`
- `outputs/file-sale-boundary-qa/a3fd0299-becd-493a-89d8-0b0a2bbc41f7`
- `outputs/drizzle-metadata-qa/692c32d0-427e-43a7-a8f4-583dcbb6a926`

These are preserved fixtures, not customer data. No cleanup of persistent provider or database entities was performed.

## Remaining release gates

This is an implemented and locally verified Downloads + Course slice, **not a declaration of full-platform or production readiness**.

1. Use a separately authorized eligible Stripe test account and webhook destination to complete a real sandbox purchase, including the A/B revision race and byte-correct delivery. Current preview has no provider credentials; mocked transport is not this proof.
2. Obtain the missing blueprint/protocol and run five real target-seller sessions. Record unassisted completion, buyer understanding and failures; no participant or conversion results are fabricated here.
3. Resolve actual seller-facing payment, tax, refund/dispute and service policies before production. Current public terms and onboarding describe the private AI studio; reusing those pages does not establish suitable marketplace/seller policies. Existing 5% calculation was preserved, not newly approved as a launch policy.
4. Keep Consulting/Community/cohort/archive capabilities unavailable until their existing routes, customer fulfillment and policies have been verified. The type table above is the separate all-type handoff, not a promise that PDF verification covers these modes.
5. Decide and implement verified transactional-email sending/retry if required for release. No receipt/notification is promised now; paid access is independent of email. Setup and notification-failure event names are reserved but not emitted for actions that do not run.
6. Inventory live legacy relationships/URLs and approve any rollout or backfill separately. No live database was inspected, and no production migration or backfill has run.

## Integration for the subsequently authorized deployment

The user subsequently requested deployment to FiveGen. Fetching GitHub found newer production work at `a3e3698` that was not in the initial local implementation baseline. The release merges that work rather than replacing it: top workspace navigation, unified Products, growth tools, Accounts v2 commerce, card/express checkout, local-currency pricing and administrator credit history remain intact.

The production branch already contains migrations 0011–0015. The never-deployed local file-sale migration was therefore renamed **0016**, with its SQL bytes unchanged. Existing remote SQL/checksums and snapshots were preserved. Missing metadata for the already-existing administrator-credit table was reconciled without changing that table. Fresh installation and upgrade from remote 0015 both apply 17 migrations, preserve a synthetic credit-history row and pass foreign-key checks; the next Drizzle diff is empty. Evidence: `outputs/migration-merge-qa/9f345f19-9c93-4512-8a43-c2c7ad52f529`.

The updated format schema includes separate `Video course` and `Consulting / Mentorship` values in addition to historical aliases. New presets use the new names; old stored formats and IDs are unchanged. Creator Voice audio uploads and private-source exclusions are preserved across the shared upload endpoints. Voice material cannot become a file-sale deliverable merely by attaching its upload ID.

This deployment installs the additive schema and guarded implementation. The new file-sale flow requires both `FIVEGEN_FILE_SALES_ENABLED=true` and `STRIPE_MODE=test`; it remains unavailable on the existing live configuration. Existing payment settings, connected accounts, billing data and automation configuration must not be changed for this release. In particular, the current Accounts v2 commerce path and its policy are not replaced by the isolated file-sale test path. Enabling real file sales needs the release gates above and reconciliation with current seller-payment policy.

The deployment target was verified in the signed-in Render Dashboard: `srv-daho9hrm8hqs73cmgt7g`, repository `KamzeFPS/fivegen`, branch `main`, manual deployments, canonical site `https://www.fivegen.ai`. The connected Render MCP account listed a different workspace; the authenticated browser is the authorized deployment path. No duplicate service, new provider account or credential configuration is needed.

Merged-release validation passed: TypeScript, full production build, all three file-sale suites, wallet billing plus administrator-credit tests, Accounts v2 commerce tests, creator-content tests, and built-HTTP creator-suite/growth integration tests. The latter run actual authentication, SQLite, blob and bundled route boundaries while blocking provider calls. Audio/voice privacy, published VSL protection, customer video access, refund/dispute revocation and flag-off behavior are included. Test fixtures remain retained; no production records were inspected or modified by tests.
