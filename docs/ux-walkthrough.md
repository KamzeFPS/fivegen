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
