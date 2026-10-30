# FiveGen Conversation First workspace — design QA

Date: 2026-10-30

final result: passed

## Selected target

The third displayed interior design (Conversation First), refined with Marketing and Design in the global sidebar and creation only on Home. Exact revised target: `outputs/workspace-selected-2026-10-30/selected-reference.png`.

## Visual verification

Opened the reference and actual 1697 × 927 Home together in `comparison-final.jpg`, then inspected the composer crop in `composer-comparison.jpg`. The implementation preserves the single quiet toolbar, orange sparkle brand, named left navigation, centered creation input, generous whitespace and quiet examples. Actual recent products replace mock names. The empty Make it control is deliberately disabled until a prompt or file is supplied; the reviewed mock shows an enabled control. The requested hide/show toggle is added beside the logo. Current allowance remains visible, including on mobile. Manual creation/import and recent chats remain secondary disclosures.

Checked light and dark Home and a 390 × 844 phone layout. No horizontal overflow, clipped text or overlapping controls in the accepted captures. The global sidebar collapses without leaving an empty gutter. Product editors retain native product navigation and open global navigation in a drawer rather than adding another permanent column.

## Corrected blocker

The first drawer inherited Tailwind individual translation (-50%, -50%) from the centered dialog, even though transform had been reset. This reproduced the user's clipped overlay report. The final drawer explicitly resets translate, transform and animation, overrides the generic dialog padding/radius, and has an accessible close control. Accepted geometry: at 1366 × 768 the drawer is x0/y0/320 × 768; at 705 × 844 and 390 × 844 it is x0/y0/320 × 844. No offscreen half-panel remains. X dismissal restores focus to the persistent navigation toggle; queued navigation restores focus before invoking the existing parent guard.

## Browser interactions verified

- Desktop hide/show and preference survival after refresh.
- Home preset fills the actual prompt; Make it sends through the existing assistant. Synthetic questions arrive in the input section, separate from conversation history.
- Marketing requires an explicit product selection; Campaigns opens that product's native Campaign Studio.
- Global navigation inside a product opens the drawer; choosing Design closes it and opens the Design hub.
- An existing Design hub product opens its native editable canvas.
- Phone drawer opens and closes, with all named destinations and visible current allowance.
- Sign out returns to the anonymous landing page. Local fixture session restored after this check.
- Light/dark appearance controls remain available. Browser error log was empty at the accepted final Home capture.

## Checks

Production build, full TypeScript, focused navigation toggle and tool-hub tests, workspace-library tests, chat composer tests, builder navigation tests, marketing navigation checks, generated appearance reproducibility and whitespace validation passed. Focused lint has no errors (one raw-image warning for the supplied brand mark).

## Evidence

`outputs/workspace-selected-2026-10-30/` contains full and focused reference comparisons, Home light/dark/phone captures, and fixed phone/16:9 drawer screenshots. Accepted final desktop: `home-final.png`; phone: `home-mobile-final.png`; phone drawer: `navigation-mobile-final.png`; 16:9 drawer: `navigation-16-9-fixed.png`.

## Limits and remaining minor notes

This is an isolated local preview with synthetic account/product data and deterministic assistant replies. No production secrets, provider charges, payment transactions or real messages were used. Not deployed. The visual implementation uses existing production font/control sizing, slightly more compact than the generated mock (P3). The GPT Image 2 integration described in the follow-up below is now implemented. Live provider verification has not been performed; local previews use intercepted synthetic replies.

## Landing preview follow-up

The older anonymous preview on59908 referenced the superseded index.DLmA_Skz.css after a shared build. The latest index.B_QZKgmJ.css returns200; the superseded asset returns404. Restarted both isolated preview services against the current build and reloaded the landing page. Safe Brand HTML display dimensions are now181×40 rather than1494×330; CSS continues to size the visible lockup toapproximately149×33 at the tested viewport and hides the opposite theme variant. Inspected `outputs/landing-logo-fix-2026-10-30/landing-fixed.png`: no oversized duplicate logos cover the composer or examples. Current production build and whitespace checks pass; no deployment performed.

## GPT Image 2 follow-up — passed

Implemented the exact requested model `gpt-image-2`. Shared Low/Med/High controls sit beside Submit on Home and the public landing page, beside Generate in Marketing images, and beside Generate artwork in Design studio. Selection persists between refreshes and synchronizes between surfaces on the same origin. Default is Medium. Image actions send low/medium/high to the provider and review4/12/40 credits respectively; the public pricing copy and documentation use the same policy. Plain chat remains a planning request, and its quality preference applies when artwork is generated.

Native editable pages remain available. The new Image layer mode creates a private PNG candidate, optionally transparent or opaque. The creator reviews it before Add to page; native text and vector elements remain unchanged. Owner-only raw candidate access prevents buyers from fetching unapplied draft artwork, while frozen purchased PDF/ZIP exports still include entitled assets internally. Marketing image generation stores verified private JPEGs; existing video generation and historical FAL jobs remain compatible.

Checked actual browser request → private candidate review → Add to page → Save design using a clearly labelled local image fixture. Low selected4 credits and sent the exact model/quality/size contract. Real HTTP checks exercised all three qualities, stored PNG owner downloads, stable duplicate replay without a second provider request, and failure refunds. Both UI and backend tests cover persisted preference, busy/duplicate guards, independent OpenAI/FAL readiness, quality pricing, chosen backgrounds, tenant isolation, version/archive races, malformed/oversized provider bytes, atomic debit/storage completion, expiry recovery and frozen buyer exports. Production build, full TypeScript, focused suites, pricing tests, whitespace and generated appearance reproducibility checks pass.

Visual QA inspected `outputs/gpt-image-2-2026-10-30/home-quality-final.png`, `home-quality-mobile.png`, `landing-quality.png` and `editor-quality.png`. At390×844 the quality selector and Submit fit on the same row with no horizontal overflow. Desktop controls preserve the approved Conversation First composition. Browser error log on the accepted Home state was empty. Temporary viewport emulation was reset.

No production environment/secrets were changed, no live provider calls or charges were made, and this work is not deployed. The browser preview artwork explicitly says LOCAL DEMO; it verifies app behavior rather than model image quality. Existing deployed OpenAI configuration is used by the implementation.


## Plans and workspace Domains follow-up — passed

New-sale allowances are Free60/month, Creator Pro2,000 for USD29/month, and Scale6,000 for USD99/month. Pricing displays each quality's alternative image capacity from the shared4/12/40-credit image policy. Existing subscription prices and credit quantities remain frozen in verified checkout/payment records, including earlier2,500-credit Pro accounts. Free credits reset by UTC calendar month and do not stack with verified paid allowances. Actual SQLite tests cover concurrent spending, upgrades/downgrades without reminting, refunds across expiry, sandbox isolation and debt. The actual Credits browser screen shows the new60 Free pool separately from purchased credits and the quality prices.

Domains is below Library in navigation and search. Each creator chooses a unique available workspace name and product paths; the platform base is configurable (defaultfivegen.ai). The two setup cards and primary Save action appear before the product list. Product paths use compact rows, six-item pagination and search, with hidden draft edits preserved in an atomic save. Native form associations and dirty-navigation guards remain intact. No nested forms or extra product-list scroll area.

Public host resolution serves only current, owned, nonarchived published snapshots and public media. Drafts, account APIs, private uploads and cross-host POSTs are unavailable. Checkout, applications and other forms continue on the canonical app origin. Name collisions, ownership, stale/CAS saves, archive races, path traversal, reserved and historical platform bases, header spoofing boundaries, body limits and status transitions have focused tests. Custom domains reuse exact TXT/CNAME verification and separate trusted hosting/TLS approval. Saving or passing DNS never falsely activates a public address.

Actual isolated browser checks saved aagii plus product1/product2, refreshed their persisted values, configured and removed a synthetic custom hostname, inspected DNS/status steps, and exercised pagination/search. At390×844 the page has no horizontal overflow; viewport emulation was reset afterward. Light and dark states were visually inspected. Saved evidence: outputs/plans-domains-2026-10-30/domains-desktop.png, domains-mobile.png, domains-dark.png and pricing-light.png. The production build completed; TypeScript, relevant credit/billing/domain/public-action/UI tests, generated appearance reproducibility and whitespace checks pass. All three previews were restarted against the same final build.

No production secrets, real provider requests, DNS changes, payments or deployment were performed. First-party wildcard DNS/hosting/TLS and creator-owned domain hosting approval must be activated before their reserved URLs work publicly. Operator setup: docs/workspace-domain-hosting.md.


## Pricing release redesign — passed locally

Replaced the tall nested-box comparison with compact cream/orange cards and a matching dark theme. Prices are shown as$0/$29/$99, the primary action is beside the buying decision, and one shared Low/Med/High control changes image estimates without changing monthly allowances. Pro has a restrained orange highlight. Fees and plan terms remain secondary; existing paid subscriptions, credit-pack separation and actual checkout readiness gates are retained. Local preview payments remain disabled; a read-only production check confirmed the existing live checkout links are enabled.

Accepted browser evidence: outputs/release-2026-10-30/pricing-desktop.png, pricing-dark.png and pricing-mobile.png. Desktop core cards fit within approximately915px including the unavailable-preview notice; production omits that notice when checkout is enabled. Phone390px had no horizontal overflow. Shared estimates, top-up switching, dark/light appearance and pricing links were exercised. Corrected the singularimage label and compact phone appearance selector found during QA. Pricing UI suite, focused lint, full TypeScript and production build pass. Viewport overrides were reset.
