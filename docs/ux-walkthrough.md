# Customer journey verification

September 11, 2026. Tested against the local app with a dedicated test product; no production products were changed.

- Completed format selection, product brief, review, sign-in, and editable draft creation.
- Confirmed a brief survives a trip to AI settings and can be resumed.
- Edited a section, previewed unsaved content, used Save & continue, reopened the product, and verified the saved title.
- Exercised section navigation, storefront settings, checkout readiness review, payment setup, and return to the product.
- Published the local test product for free and inspected its customer-facing page.
- Validated the ZIP export and free delivery endpoints return 200. Decompressed the export and confirmed the saved section title appears in the delivered files.
- Checked desktop and phone layouts at 390 × 844 and 390 × 667. No horizontal overflow; the compact creation dialog keeps its footer visible and scrolls only its body when necessary.
- Verified the editor has no nested scrollable content fields, and mobile navigation closes after a selection.

TypeScript checking and the production build pass. The build retains existing middleware deprecation and large client-chunk warnings.

The embedded browser blocks file-download completion; download contents were verified through the local endpoints. Live AI generation, paid media generation, and real payment transactions were not exercised in this UX pass.

## Expanded product audit

- The isolated Render journey test creates, edits, publishes, exports, and accesses all eight formats with distinct test briefs and saved content. It checks member access against different signed-in customers, private video access and byte ranges, disabled VSL privacy, template filenames, stable progress, consent, duplicate leads, community moderation, booking ownership, attendance, CRM isolation, Free-plan limits, invitation acceptance/revocation, and restart persistence.
- The financial suite exercises partner share rounding, first-purchase-only attribution, self-referrals, initial subscription payment resolution, holds, repeated claims, partial refunds, transfer recovery after a lost acknowledgement, and a refund arriving during a payout. Stripe is replaced only within tests; no money moves.
- Browser testing uploaded and played a real two-second MP4, attached it to a lesson, saved delivery settings, completed a product, and posted in its private community. The local Cloudflare upload path required a FixedLengthStream; this was fixed and retried successfully.
- Editor headings and banners no longer crowd Delivery. Save actions do not overlay the bottom of the editor. Sidebar navigation fits typical laptop heights; mobile community guidelines follow the conversation, and CRM has one page heading.
- AI content/media quality, live Resend delivery, and real Stripe payouts require configured services and were not claimed as tested. Test products and posts are local fixtures, not customer activity or production examples.
