# Page template backend verification

25 October 2026 · Local regression and security validation. No provider/network calls.

## Test files

- `scripts/product-page-test.mjs`: existing product-page regression harness updated for the explicit free-offer and retired-file-sale dependencies. It continues to test owner/auth/CSRF/revision guards, snapshot isolation, private paid content, media ownership/signatures, verified buyer reviews, refund-aware public ratings and unpublishing.
- `scripts/page-template-test.mjs`: new focused template/preset/history/publication suite using actual schema and services, real migrated SQLite and private object storage. Paid/free eligibility is mocked; no real Stripe availability is inferred.

## Verified behavior

1. Missing template IDs on older saved configs retain `classic`; new pages default to `cinematic`. Gallery IDs are unique and the new choices preserve creator copy/sections/links while applying the intended style. Template application is immutable.
2. Schema rejects unknown styles, unsafe/non-HTTPS/credentialed URLs, injected commerce/publication fields, excessive text, duplicate/invalid section IDs, empty section lists, invalid media identifiers and extra nested fields.
3. Page and section images require current product ownership, completed upload, supported raster MIME/signature, size constraints, available stored bytes and exclusion from Voice Library. Another product owned by the same creator is not an eligible source.
4. Save persists a private draft/history entry. Stale writes and a denied operation guard change neither draft revision nor success history.
5. Publication preserves template/copy and exposes only safe product summaries. Paid lesson bodies, download contents, private growth scripts and hidden identity do not appear in public data.
6. Disabled sections and their images are absent from public data/access. Draft changes remain private until an explicit new publication.
7. Restoring a history version produces another draft, never a publication. Current ownership/availability checks still apply; a deleted original image cannot be restored through stale history.
8. Nonlegacy sales pages require an enabled hero and a valid destination for a custom-link CTA. Invalid publication attempts preserve the existing public version.
9. Saved commercial state distinguishes paused checkout, eligible paid checkout and eligible free access. Published amount/currency/version and real destination are retained without exposing delivery content. Mock eligibility is not a live payment test.
10. Brand presets are creator-scoped, strict, origin-protected and capped atomically at 20, including two concurrent additions when 19 exist. Applying a template does not publish it or overwrite copy.
11. History is owner/product-scoped, ordered and limited to 30 snapshots; another product’s history is excluded even for the same owner.
12. Unpublishing revokes public page and section-media access while retaining the owner’s editable draft. Foreign-key checks pass.

## Scope limits

This validates backend behavior and persistence with synthetic fixtures. It does not prove visual parity, responsive usability, accessibility conformance, live payment eligibility, real email delivery, external media embed availability or conversion improvement. Root owns the final built-app visual and browser checks.
