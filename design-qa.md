# FiveGen continuous page scrolling QA

26 October 2026. Scope: remove unnecessary nested scrolling while preserving the existing design and tasks.

## Findings and changes

1. Sales page settings and preview had separate viewport-height scrollboxes. Both now grow in document flow, including narrow-width and full-width preview modes. Clicking a preview section deliberately reveals its editing fields. Draft changes and autosaves do not trigger page repositioning.
2. Funnel Builder combined a fixed-height map, inspector, scrolling idea/checklist body and a separate scheduled-items list. The reading journey and desktop details now expand with the page. Selecting a stage reveals its details below the workspace header. Freeform map editing keeps its intentional pan/zoom canvas.
3. Source excerpts, historical marketing copy, imported-section reviews, chapter outlines, customer message history, decision diagrams and Calendar notes had unnecessary short vertical caps. Removed those caps. Long-form writing and shared studio fields now measure their text and grow on content or width changes; sales copy uses the same behavior.
4. Mobile Funnel details and Page tools retain a single bounded dialog scroll. Nested content inside those surfaces expands naturally. Scheduling remains a separate dialog and was closed without saving. Product switching, search, tables and genuine chat/canvas surfaces retain scrolling when their content cannot fit.
5. Removed the obsolete sticky schedule footer shadow from its source rule as well as the final override, so the Light appearance compatibility layer cannot restore the old scroll-edge shadow.

## Current-run evidence

All files below are in `/Users/kamze/Documents/ChatGPT/fivegen/outputs/scroll-simplification-2026-10-26/`.

- Visual baseline/source truth: `01-funnel-before.png` and `02-sales-before.png`, 1440 × 1000 CSS/pixel viewport, anonymous isolated fixture account in the local workspace. This is a behavior correction to the existing design, not a new visual concept.
- Funnel after: `05-funnel-after.png`, 1440 × 1317 full-page pixels at 1440 × 1000 CSS viewport. The map, inspector and idea body report overflow:visible and equal client/scroll heights. The fifteen-product rail is the only active navigation scroller; it cannot fit vertically in this viewport.
- Sales after: `03-sales-after.png` and `08-sales-section-reveal.png`, 1440 × 1000. The former is scrolled down to demonstrate one continuous page; the latter shows a selected lower preview section and its focused editing fields beneath the sticky header.
- Long writing: `04-writing-long.png`; a 7,353-character temporary lesson grew to 6,122 CSS px, and to 7,432 px after narrowing to 705 px. In each case clientHeight equalled scrollHeight. Original text was restored through the UI.
- Mobile sales: `09-mobile-sales-tools.png`, 390 × 844 CSS/pixel viewport. One inspector scroller, no horizontal page overflow. Closing restores focus with preventScroll; selecting a preview section reopens the appropriate controls.
- Mobile funnel DOM check: 390 × 844; one inspector scroll surface (842 px high, 1,181 px content), with an expanded idea body (799 px client/content) and schedule footer (193 px client/content). The schedule form was opened, checked and closed without saving.
- `10-mobile-funnel.png` is rejected evidence: the viewport screenshot was rescaled/clipped during a browser viewport transition. It is not used to judge the mobile layout. Browser viewport changes can reparent funnel details into the mobile portal and reset its local tab; normal node event handlers remain unchanged.
- Combined source/after evidence: `comparison-funnel.png`, two 1440 × 1000 regions with matching Dark state and no density rescaling. Opened together to check typography, palette, spacing and content preservation.
- Final updated desktop: `13-funnel-approved.png`, 1470 × 1269 full-page pixels at a 1470 × 745 CSS viewport, Light. The obsolete footer shadow is confirmed `none`; the prior duplicate shadow artifact is resolved. Browser-native desktop checks also covered 1470 × 801; explicit checks also covered 1440 × 1000, 705 × 900 and 390 × 844.

## Required fidelity surfaces

- Typography, wording, brand assets, colors and creation/payment behavior remain unchanged. Existing cards, stage hierarchy and responsive navigation are retained.
- Layout now uses the document for ordinary content. No artificial minimum preview filler, cropped content body or small reading scrollbar remains in the changed panels.
- Real artwork and creator-customized pages remain intact; no replacement assets or image edits.
- Focused inspection covered section selection, long writing, stage details/checklist, mobile tools, schedule form and close/focus return. Browser snapshots and saved screenshots supplement measured overflow checks; a screenshot alone does not establish scroll behavior.

## Validation and limits

Production build, TypeScript, focused editor/fields lint, existing sales-page UI, product-page, creator studio UI, Funnel Builder, funnel navigation, Calendar UI and appearance tests passed. Appearance compatibility CSS was regenerated. Existing sales editor React lint findings are unchanged from HEAD. Browser console entries observed were warnings from an installed Chrome extension, not app errors. No real AI, payment, email or publishing calls were made. Temporary writing/copy edits were restored, and the funnel was reloaded to its saved strategy with its two original actions intact.

final result: passed
