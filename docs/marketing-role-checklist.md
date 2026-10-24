# Marketing role implementation checklist

Approved scope: all 20 recommendations from the 25 October marketing-role audit. Implementation is local; production deployment and live-provider verification are separate from these checks.

All 20 items are implemented and locally verified. Existing published lead links and approved/enrolled email snapshots are retained.

- [x] **MR-01** — Rename Funnel to Lead capture and describe the tools by their actual job
- [x] **MR-02** — Stop the shared text-field CSS from stretching checkbox controls
- [x] **MR-03** — Give the existing lead page a complete, canonical purchase handoff
- [x] **MR-04** — Consolidate sales and lead pages onto one purpose-aware public page engine
- [x] **MR-05** — Make lead capture a first-class section of the shared page engine
- [x] **MR-06** — Create one owned sales-recording picker shared by VSL and public pages
- [x] **MR-07** — Separate VSL generation from page copy and email draft generation
- [x] **MR-08** — Use one reviewed offer brief with explicit copy handoffs between tools
- [x] **MR-09** — Extend ConnectedLaunch into the single outcome-oriented Growth plan
- [x] **MR-10** — Connect campaign preparation to Email delivery with visible item-level status
- [x] **MR-11** — Repair Customers and CRM deep links so the selected person survives the handoff
- [x] **MR-12** — Make customer relationship and action eligibility explicit at each handoff
- [x] **MR-13** — Review and snapshot the actual destination of future email sequences
- [x] **MR-14** — Bring scoped Results into the existing Growth plan
- [x] **MR-15** — Separate offer research from controlled page optimization
- [x] **MR-16** — Give the private Creator library a global home with product-scoped selection
- [x] **MR-17** — Migrate duplicate public pages through explicit snapshot review
- [x] **MR-18** — Make tool visibility distinct from active publishing and delivery
- [x] **MR-19** — Add real campaign and page identities before supporting concurrent launches
- [x] **MR-20** — Complete the qualified-call goal with a real pre-purchase application handoff

## Evidence

- Shared page engine: `scripts/shared-public-pages-test.mjs`.
- Campaign and Email identities/destinations: `scripts/campaign-email-identities-test.mjs`, `scripts/campaign-email-ui-test.mjs`.
- Foundation and customer/application regressions are included in the final validation record.
- Browser evidence and the final build/typecheck results are recorded in `outputs/marketing-role-implementation-2026-10-25/`.

## Compatibility and limits

- Canonical `/product/:slug` and preserved `/g/:slug` remain reachable. Additional pages use stable `/pages/:pageId` identities.
- Importing legacy copy creates a reviewed private draft; publication is a separate action. No redirect, re-enrollment or replacement of approved email payloads is automatic.
- Social assets are prepared and published manually. Application decisions and booking handoffs remain manual; they do not reserve a time, charge, or grant access.
- Additional-page form receipts are scoped by page and publication. Visits are not measured on those pages, so no visit-to-lead conversion is invented.
- No live charges, email sends, AI generations, secret changes or deployment are part of local verification.

## Final local validation

- 51/51 synthetic service and UI regression suites passed.
- TypeScript and the Render production build passed; four Render runtime checks passed.
- Desktop (1487 × 1058) and phone (390 × 844) browser checks passed. Published lead and application submissions were verified against the isolated fixture database.
- Editor previews created zero leads; the application created zero purchases, marketing leads or Email enrollments. Declining marketing on the public signup saved marketing=0 and an exact page/version/section receipt.
- Shared source checkboxes measure 18 × 18 px on desktop and phone. Document width equals viewport width in the checked phone Sales page, Sales video and published lead page.
- Browser console checks returned no errors in the final reviewed desktop and phone tabs.
- Evidence: [validation record](../outputs/marketing-role-implementation-2026-10-25/test-results.json), [browser data checks](../outputs/marketing-role-implementation-2026-10-25/browser-data-validation.json), [design QA](../design-qa.md).
