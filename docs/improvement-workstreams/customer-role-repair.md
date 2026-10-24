# Customers and qualification applications — MR-11, MR-12 and MR-20

Implemented locally for the approved marketing role repair backlog in `outputs/marketing-role-audit-2026-10-25/implementation-backlog.json`. No production deployment or external provider action was performed by this workstream.

## MR-11 — one person, supported destinations

- Selected-product Customers now scopes both audience and lead queries on the server. Global Customers remains global until a product filter or product context is selected. Product-builder People includes All people, Leads & personal replies, Buyers & delivery and Applications; the existing purchaser delivery controls remain under Buyers.
- `lib/customer-destination.ts` creates supported routes, opaque owner-owned relationship references and bounded relative return paths. Lead signup, consent and private-note timeline entries open the lead detail in Customers. Paid builder orders open the actual Buyers workspace with the matching order. Pending, revoked and historical records open their scoped record without fabricating buyer management rights. Order record review includes the existing owner-verified billing/access-message/refund panel.
- `customerProduct`, `customerPerson`, `customerLead`, `customerOrder`, `customerApplication` and `customerTab` keep the relevant scope in the URL. Search, relationship, consent, mode, lead status and application status survive refresh. Browser back updates selection; leaving unsaved lead notes retains the existing Save & continue guard.
- Requested person detail is resolved independently from list filters. An outdated, removed, unauthorized or wrong-product relationship returns a scoped unavailable state. It does not substitute another creator’s person or a different product’s contact.
- Email history handoffs use supported Emails URLs, opaque person/job/enrollment context and Return to person. `/api/customer-context` resolves an owned reference only; it excludes application answers, private notes, access tokens and payment credentials.

## MR-12 — explicit relationships and action boundaries

- Purchase history, current access, subscription state and product marketing permission remain separate facts. Pending checkout attempts create no buyer/client/member role. Refunded/revoked history remains visible with blocked access. Old order-ledger rows are explicitly historical, with unknown mode/access rather than inferred active membership.
- Applicant is a separate role. Applying, qualifying, adding a note, saving a filter or preparing a handoff does not mark someone a paid client, grant access, change an order or authorize promotional email.
- Lead-only records offer lead notes and a manual reply draft, with an explicit no-purchase state. Buyer delivery, sessions, submissions, community access and portal messages stay behind existing owner/product/order/mode authorization.
- The CRM manual reply comes from the saved product Emails reply template (with existing legacy compatibility), not from editing VSL content. Displaying or copying a reply never sends or enrolls.
- Creator and buyer service message controls say they save to the customer portal. They do not claim an email was sent.

## MR-20 — real pre-purchase qualification applications

- New additive migration: `drizzle/0051_service_applications.sql`. It stores private submissions, frozen form/acknowledgement snapshots, separate optional marketing choice, owner review revisions, manual handoff preparation and bounded submission-rate buckets. It contains no payment, entitlement, invite or calendar-grant fields.
- `applicationFormConfigSchema`, `defaultApplicationForm()` and publication validation power the shared page engine’s application section. Creators can configure up to eight short/long/choice questions, purpose, required review acknowledgement, optional separate marketing opt-in and an HTTPS scheduling destination. Reserved question identifiers and unknown/oversized answers are rejected.
- `PublicApplicationForm({pageId,sectionId,config,version,preview})` submits only to the real published page/section/version. Preview disables inputs and performs no request. Validation/provider errors retain answers. A stable request ID provides safe same-payload retry; reused identifiers with different payloads are rejected.
- Submission re-resolves the current publication, validates exact questions/options and uses an atomic publication-version guard during insertion. Unpublish or replacement between read and write creates no application, review receipt or marketing signup. Required application review acknowledgement is distinct from optional marketing. Declining optional marketing still submits the application and creates no marketing lead or enrollment. Explicit opt-in can use existing reviewed automation eligibility; suppression remains intact. Answers never enter that lead or email/AI source data.
- Owner-only Applications supports New, In review, Qualified for a conversation, Not a fit and Closed. Compare-and-swap review revisions prevent stale overwrites, and review/handoff actions leave an audit trail. Existing CRM and People surfaces show private review under the same product/person.
- Preparing/copying a booking handoff requires a saved qualified status and reviewed HTTPS destination. It creates only a manually reviewable draft. It neither sends a message nor books, charges, accepts a client or grants access. The external calendar link is public configuration, not an access gate, and calendar availability is not verified by readiness.
- `serviceApplicationReadiness(productId,owner,pageId?)` inspects actual enabled, published application sections; Growth plan supplies its selected page ID so one page cannot inherit another page’s booking readiness. Omitting the optional page ID retains generic workspace summaries. It checks published sections and their question/manual-review/scheduling configuration for Growth plan. Generic newsletter forms and paid-buyer intake do not count as pre-purchase qualification.
- Applications and private answers are omitted from the default creator archive. They are exported only when the creator deliberately includes private audience records, with explicit manifest labeling. They are excluded from ordinary audience/email/AI projections.

## Verification

Synthetic local tests, using actual source and additive production migrations:

- `node scripts/service-applications-test.mjs`: shared real page resolver/publication guard, question validation, required acknowledgement, separate opt-in, retry/collision, unpublish race, exact selected-page readiness with two independent application pages, private owner review CAS/history, qualified handoff, owner/product/API isolation, suppression retention, submission limits and no money/access/calendar/message effects.
- `node scripts/customer-context-test.mjs`: actual scoped audience/lead/person APIs; note/consent/payment/email timeline paths; opaque references and safe return paths; requested detail independent of list search; pending/revoked distinction; wrong-product/foreign/deleted context; private notes cannot change consent/payment/enrollment.
- `node scripts/customer-context-ui-test.mjs`: actual form handlers and preview with zero network, separately optional marketing, failed submission preserving answers, scoped audience actions, lead-only action boundaries, People tabs and semantic field labels.
- Existing customer operations, analytics workspace UI, product studio creator UI and shared public page suites continue to pass after fixture integration updates. Full TypeScript check passes across the shared workspace.

Browser responsive layout, keyboard/focus traversal and assistive-technology validation are integration QA, not certified by these component/service tests. Deployed sender/worker, real calendar availability, Stripe and production authentication remain external verification. No live email, charge, refund, access grant or booking was performed.
