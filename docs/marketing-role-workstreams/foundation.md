# Marketing roles: foundation, Growth plan, Creator library and Results

Implemented locally on 2026-10-25. No deployment, live provider request, real payment, real email or real customer mutation was performed in this workstream.

## Information architecture and visibility — MR-01, MR-02, MR-16, MR-18

- Marketing keeps stable internal IDs and routes (`dashboard`, `vsl`, `funnel`, `automations`, `voice`) while displaying **Growth plan, Sales video, Lead capture, Emails, Creator references**. **Results** is a permanent destination alongside Growth plan. Campaigns describes promotional drafts and manual publishing reminders; no native social publishing or clipping is claimed.
- The tool manager customizes **visible shortcuts**. Its changes never create a charge, publish, activate sending, revoke a source or delete drafts. A hidden tool's direct URL opens its real workspace without changing visibility. The Growth plan retains running activity, with specific published-page editor links, email controls and active research/experiment links.
- Shared text-field sizing excludes checkbox, radio, file and color controls. Source labels have a compact 18px control, flexible wrapping text and a collapsed optional references disclosure. The disclosure shows the exact selected source titles and reviewed revisions, missing/stale references and the product's explicit profile selection. A revoked profile can be deselected rather than trapping the creator behind a disabled checkbox.
- `/?view=creator-library` is the global home for the reusable private profile and source library, reachable in the primary navigation and workspace search. The profile has review/enable controls and optimistic save; changing text clears approval. Sources keep their original owned product/upload linkage; adding a recording explicitly identifies the product receiving private storage. No product is automatically opted in. With no products, the shared profile still works and source attachment explains why an owned product is needed.
- Product Settings and the legacy `voice` tool show the concise product selection rather than a second global profile editor. Settings selection participates in the existing real Save and continue guard. Source approval permits use as private AI context; it is not public recording playback permission.
- Ordinary product-library clicks now use the same destination as native new-tab clicks, including file-sale and legacy product entries. Existing builder, file-sale and marketing URLs remain supported.

## Shared editor handoff — MR-03–06 integration, MR-15 placement

`LeadCaptureWorkspace` lists purpose-aware lead/application pages and creates a new private record through the shared page API. It navigates with the client router after releasing creation busy state, preventing a successfully created draft from being stranded by the parent unload guard. The compatibility editor owns separate dirty/busy state; creation and page management are disabled while it has pending work.

Creators edit new pages through `/build/{productId}?area=page&page={pageId}`. The shared `PublicPageManager` exposes reviewed legacy snapshot import. The earlier `/g` editor remains in a collapsed compatibility section with explicit independent publication controls; importing never pauses or replaces it silently. The root page workstream owns form configuration, media/publication validation, templates, public rendering, migration and purchase terms.

Sales video uses the same owned `SalesRecordingPicker` as the page editor. Selection is a private revisioned draft; the creator separately chooses the recording in the intended page video section and publishes. Picker upload busy state participates in the parent navigation/save guard. No private Voice source is offered as a public recording.

Offer research retains surveys, interviews, stated preference, price hypotheses and its explicit field-change preview into the shared brief. Controlled experiments are reached through Sales page Advanced, with a shortcut from Research and Results. Research no longer renders a second experiment editor. Real active experiment records appear in activity even when the Research shortcut is hidden.

## Scoped generation and shared offer facts — MR-07, MR-08

The public `POST /api/products/{id}/growth/generate` now requires an explicit `asset` (`vsl`, `landing`, `followUp`) and creates a **durable proposal**, not an overwrite. Missing-scope historical HTTP requests receive an actionable 400 without a provider call or credit spend. The historical bundled function remains internal for prior credit/crash regression coverage and has no public route or current UI caller.

The Sales video UI requests only `vsl`, shows current and proposed text, defaults to **Append**, and requires an explicit Replace choice to replace text. Apply checks the exact workspace revision, product facts, source/profile/selection revisions and proposal identity again, including atomic source and product guards. Other saved assets stay unchanged. Actual credit reservations complete only when a valid proposal commits; provider/validation/concurrent-source or product changes preserve saved assets and refund a failed reserved run. Previous saved versions remain inspectable.

`reviewedOfferFacts(productId, owner)` returns safe authoritative title, description, format, section titles, price/currency and saved product/builder revisions plus an atomic SQL guard. It never includes lesson bodies. Positioning, creator story, evidence and research remain separate in the shared Growth brief. Page-copy and Campaign workstreams reuse these facts/brief contracts. Source-free manual writing remains supported. An older personal follow-up draft stays editable in a compatibility disclosure; reusable/new email work points to Emails.

## One Growth plan — MR-09, MR-19 integration, MR-20 integration

The existing ConnectedLaunch route and storage become Growth plan, rather than adding another planner. Migration `0053_growth_plan_reviews.sql` adds selected page/campaign IDs, optional script/email choices, exact review markers and scoped proposal storage/run identity.

A saved plan selects one goal and destination, optionally a real campaign, script and email follow-up. Saving this selection only changes checklist state and never changes tool visibility, publishes, charges credits, enrolls people, activates email or enables selling.

- **Leads:** the selected published lead form and exact page review. No script, library, checkout or sequence is mandatory.
- **Sales:** the selected published selling page, exact page review and actual commercial availability and the exact selected publication’s checkout CTA. A form-only or external-link destination cannot inherit readiness from the product payment account. Test versus live availability stays visible. Buyer access remains governed by existing server payment/delivery checks.
- **Calls:** an actual published application plus `serviceApplicationReadiness`, which verifies questions, manual review and the reviewed HTTPS booking destination on that exact selected page (a different page’s booking link cannot satisfy it). Post-purchase buyer intake is not substituted for an application.
- A selected campaign must contain assets; optional script/email steps appear only when selected. Emails still owns sender, consent, recipient and activation review.

Review records bind an exact asset revision and context fingerprint. Editing the asset, shared brief, authoritative facts, sources or publication reopens review. Explicitly reviewing retained copy against the current reference state can clear the current manual review without rewriting the copy or erasing its original provenance. Removed/unapproved references must first be fixed or deselected. Reviewed page checks use immutable publication versions, independent of unpublished draft edits.

Product Overview reads a small summary from this same saved Growth plan API. Its existing delivery/editorial checklist is labeled **Product setup checklist**, with marketing next actions and Results linking to the one Growth plan. No second set of marketing recipe state is stored there.

## Scoped Results — MR-14, MR-15, MR-19 integration

`journeyResults` and `JourneyReport` expose explicit product, page/purpose, campaign, date, named-link channel, payment mode and financial currency scopes. Changing product/campaign/page identity resets client state before an effect can present cached metrics.

- Canonical page events count distinct anonymous same-browser sessions per event. No event/session identity is added to legacy daily visitors or interpreted as unique people.
- Additional shared-engine pages currently **do not measure visits or CTA sessions**. Results says this explicitly and shows independent page/date-scoped form receipts and applications. It never invents a denominator or conversion rate.
- Form receipts do not carry campaign/channel identity. When those filters are selected the report explicitly retains and labels their page/date scope, rather than pretending they were attributed.
- A new product’s virtual default campaign (ID equals the owned product ID) appears consistently in campaign inventory and Results before its first save. Viewing empty results never creates a campaign. Selecting that default clears the separate selection preference; it does not force a draft row. First save preserves the same identity without a duplicate summary. Other owner/product campaign IDs remain rejected.
- Campaign/channel order and session filtering requires the exact named-link identity, actual campaign ID and destination page reference. Unattributed orders are counted visibly. Direct/legacy records are not guessed into a campaign.
- Verified paid amounts require paid state, exclude free/bundle entitlement rows, revocation and refund/dispute ledger facts, keep test/live and currencies separate, and do not claim gross payment amounts are net earnings. Order coverage includes attempts as well as linked/unlinked history, so its denominator is labeled order attribution coverage, not purchase conversion.
- Payment mode and currency filters apply only to financial rows; anonymous page observations have neither field. Email provider acceptance is defined as acceptance of a send request, not inbox delivery, reading or purchase, with a direct link to actual Email job history.
- Suggested next actions state the observed sample and scope and link to existing Customers, Campaigns, Sales page or Advanced optimization. Legacy analytics/earnings remain a named advanced disclosure with their own independent scope/definitions.

## Verification

Focused commands use the bundled Node binary:

```sh
/Users/kamze/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/growth-plan-results-test.mjs
/Users/kamze/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/marketing-role-ui-test.mjs
/Users/kamze/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/analytics-workspace-ui-test.mjs
/Users/kamze/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/editor-save-registry-test.mjs
/Users/kamze/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/typescript/bin/tsc --noEmit --pretty false
```

Passed independently in this workstream: Growth plan/Results, marketing role UI, creator launch, foundation experience, workspace library, builder navigation, product builder, editor save registry, historical Growth AI plus public scope rejection, marketing navigation, analytics workspace, connected marketing and creator collaboration suites. TypeScript passed. Root owns the consolidated final suite/build and live local browser evidence.

The new backend suite uses real SQLite migrations and real credit ledger operations, with isolated AI transport, public-page inventory and application-readiness fixtures. It verifies proposal preview/append/replace, ownership, idempotency, stale workspace/source/facts conflicts, concurrent product mutation refunds, retained versions, manual goal readiness, exact review reopening, visibility boundaries and independent Results scopes/refund exclusions. It does not claim a live provider or calendar test.

The new UI suite executes actual handlers: goal and exact-revision request bodies, no tool visibility/publication writes, successful private page creation navigation with busy release, compatibility dirty protection, shared profile CAS/manual path, and cached-product identity protection. These are component/handler tests; browser computed styles, mobile layout, keyboard and assistive-technology checks require separate root/browser evidence. Additional-page visit/CTA coverage is deliberately unimplemented and visibly reported as such.
