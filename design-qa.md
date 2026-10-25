# Funnel Builder and shared Calendar QA

final result: passed

Reviewed October 25, 2026 in the isolated local production-build preview at http://localhost:5198. This verifies the implemented UI and synthetic service flows. It does not certify a production deployment, live AI responses, social authorization/publication, email delivery, or a full assistive-technology audit. The previous review is preserved in `docs/improvement-workstreams/design-qa-before-funnel-calendar.md`.

## Source and rendered evidence

The selected source is the user-attached `codex-clipboard-15f3684f-cc3f-4692-b07c-e7a6c379d4c5.png`, 1489 × 1056 pixels. The original source density and font metrics are unknown. Final desktop captures use 1489 × 1056 CSS/output pixels at devicePixelRatio 1. Final phone captures use 390 × 844 CSS/output pixels at devicePixelRatio 1. No screenshot was resampled to manufacture a match.

Evidence is under `outputs/funnel-calendar-2026-10-25/`:

- `funnel-desktop-final.png`
- `funnel-comparison-final.png`: source and implementation side by side, opened and reviewed together.
- `funnel-inspector-comparison-final.png`: source and implementation inspector crops, opened and reviewed together.
- `funnel-phone-final-fixed.png`
- `calendar-desktop-final.png`
- `calendar-phone-final-fixed.png`
- `build-final.log`, `calendar-test-final.log`, `calendar-ui-test-final.log`

## Intentional adaptations

The existing FiveGen product rail, workspace shell, typography and brand tokens remain consistent with the rest of the app. The source's floating map toolbar overlapped product navigation; advanced controls now live under Edit map inside the canvas. Actual saved strategy content, outline length, graph notes and account data are shown instead of hard-coded mock testimonials, hooks or audience claims.

The subsequent user request adds one workspace-wide Calendar beside Creator library. Schedule video is therefore the main idea action, while Add to map remains available separately. The footer shows actual scheduled items and their account/timezone. Creator interview, strategy generation and editable graph remain a separate Funnel Builder module; Lead capture retains its existing job. Calendar was not duplicated in the product sidebar.

## Required fidelity surfaces

- Typography: clear page, stage, idea and hook hierarchy; consistent existing app font stack. Full audience and long idea context remain accessible in details/disclosures rather than overwhelming the map. Phone text wraps within 390px.
- Spacing/layout: audience → TOFU → MOFU → BOFU journey, one selected stage and adjacent details match the selected direction. All three stages fit the matched desktop view. Details scroll independently above the schedule footer. The phone inspector is a full-screen Radix dialog. The Calendar has an account rail, date grid and agenda; account controls collapse on phones.
- Colors/tokens: dark surfaces, restrained borders, orange selected/action states and distinct stage accents follow FiveGen's shared palette. Selection, status and account colors do not replace text labels.
- Images/assets: existing FiveGen logo and shared Lucide icons render sharply. No new decorative raster asset or invented customer imagery is required. Graph edges are functional relationships.
- Copy/content: Get discovered, Build trust and Convert explain TOFU/MOFU/BOFU. Calendar labels identify account, product, timezone and source. Manual planning, queue eligibility, provider acceptance, bookings and completed plans are not represented as verified publication or delivery.

## Findings and repairs

| Priority | Finding | Repair and final evidence |
| --- | --- | --- |
| P2 | Initial desktop composition clipped the BOFU idea footer and competed with the assistant mascot. | Compact audience summary, remove redundant breadcrumb and hide the mascot on focused Funnel/Calendar surfaces. Complete journey in `funnel-desktop-final.png`. |
| P2 | Long idea context crowded the hook and recording outline. | Keep the idea title prominent and place long context under Why this idea fits. Independent detail scroll keeps all controls reachable. |
| P2 | Phone detail surface did not isolate background controls. | Reuse real Radix modal primitives. Browser verified background aria-hidden, body scroll lock, nested scheduling focus and Escape focus restoration. |
| P2 | Initial phone sheet inherited Tailwind's separate translate property and rendered half offscreen. | Explicitly reset translate and dialog radius. Final measured bounds: x=0, y=0, width=390, height=844; see `funnel-phone-final-fixed.png`. |
| P2 | Calendar account controls consumed too much phone space. | Accessible collapsed Accounts selector, persistent Add profile, select-and-collapse with focus restored to selector. See `calendar-phone-final-fixed.png`. |
| P2 | Desktop Calendar month rows extended below the matched viewport. | Responsive row height uses the remaining viewport space; full six-row grid bottom=1039.38 within 1056px. See `calendar-desktop-final.png`. |
| P1 | datetime-local input could show edited text without updating React state in actual browser input. | Handle input and change consistently. Browser saved Oct 27 10:30–11:00 in Asia/Ulaanbaatar; live preview, persisted event and funnel schedule agree. Component-handler regression covers this path. |

No actionable P0/P1/P2 remains in the reviewed final states. Independent visual review also found no additional material issue in Funnel desktop/phone or Calendar phone. Phone calendars intentionally scroll through the month. Very small viewport heights use normal vertical scrolling.

## Interactions verified

- Creator interview and deterministic intercepted strategy generation; private save, failure recovery, credit reservation/refund and editable graph regressions.
- Stage selection, idea navigation, hook/outline copy controls, editable idea, add-to-map and advanced graph editing.
- Save current strategy before scheduling; account creation inside scheduling; required account, product and saved funnel references.
- Create two account profiles in different timezones; schedule a funnel idea for Alex · Instagram; show that item in both Funnel Builder and Calendar.
- Create a manual task for Studio · YouTube on Oct 28 at 09:00 America/Los_Angeles. The shared Asia/Ulaanbaatar display correctly shows Oct 29 at 00:00 and retains the original schedule.
- Manual event cancel/restore semantics, title-only exact-UTC preservation, all-day exclusive end and DST handling in meaningful backend/component tests.
- Account filters isolate schedules. Month and Agenda show source links. Product filter and day deep links preserve context. Extra account/product records created during preview were preserved.
- Phone detail bounds, no horizontal overflow, modal background isolation, nested schedule close, Escape focus return to Explore Get discovered. Calendar account selector expansion/selection/collapse and focus return.
- Final desktop Funnel and Calendar browser console error queries were empty.

## Validation and boundaries

Repository TypeScript, focused ESLint, git diff whitespace checks and the final Render production build pass. Calendar service tests and actual component-handler tests pass. The broader approved-improvements run passed 53/53 suites, with runtime creator HTTP and Render integration checks; see `outputs/calendar-release-2026-10-25/`. Owner isolation, origin checks, CAS, idempotent saves, references, migrations, source projections, private-data boundaries, AI leases/refunds and safe product deletion use isolated fixtures.

No production records, Stripe settings, email jobs or live provider calls were used for this QA. Scheduling creates persistent plans. Social OAuth and automatic publication are outside this implemented calendar; account profiles are explicitly manual. Imported records remain owned by their original module and are edited there. Bounded date windows and truncation are surfaced rather than presenting partial data as exhaustive.
