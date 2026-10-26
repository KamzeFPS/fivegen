# FiveGen hero edge fidelity QA

Date: 26 October 2026, Asia/Ulaanbaatar.

## Findings and fixes

- **[P2, fixed] The hero image had straight top and bottom boundaries.** The selected reference blends the desk into the surrounding page. The previous implementation masked only the figure's left edge; its contained raster still ended abruptly inside that figure. The image now keeps its natural ratio and receives intersecting horizontal and vertical alpha masks. Its center stays sharp and its caption remains outside the mask. Both standard and WebKit mask declarations are included.
- **[P2, fixed during this check] The pale left edge reduced dark-theme headline contrast.** The first feathered Dark capture still placed some bright desk background behind the end of “your subject.” Dark mode now begins its left fade later and reaches full opacity farther right. The final capture separates the white headline and the bright artwork. On phones the stacked image uses a gentler, symmetric horizontal fade.

## Visual truth and evidence

All paths below are relative to `/Users/kamze/Documents/ChatGPT/fivegen/`.

- Source visual truth: `outputs/sparkle-redesign-2026-10-25/concepts/selected-light-dark-revision.png`, 1073 × 1466 pixels, selected Creator's Desk concept, Light.
- Before: `outputs/sparkle-redesign-2026-10-25/screenshots/24-live-homepage.png`, 1440 × 1024 pixels.
- Final implementation: `http://localhost:59908/`, anonymous homepage, first example tab, top of page. Light and Dark were selected through the visible Appearance control.
- Final Light: `outputs/hero-feather-2026-10-26/04-desktop-light-final.png`, 1440 × 1024 pixels and CSS viewport, IAB.
- Final Dark: `outputs/hero-feather-2026-10-26/03-desktop-dark-final.png`, 1440 × 1024 pixels and CSS viewport, IAB.
- Combined source/final hero: `outputs/hero-feather-2026-10-26/comparison-source-final.png`. The source's top 1073 × 767 region was proportionally scaled to 1440 × 1029, then cropped by five pixels to the implementation's 1440 × 1024 viewport. Both full hero views appear together in one input.
- Before/after hero: `outputs/hero-feather-2026-10-26/comparison-before-after.png`.
- Mobile full captures: `outputs/hero-feather-2026-10-26/05-mobile-light-full.png` and `06-mobile-dark-full.png`, each 390 × 5160 pixels, CSS viewport 390 × 844. The top 1056 pixels appear together in `comparison-mobile.png`, covering copy, image and caption.
- Tablet: `outputs/hero-feather-2026-10-26/08-tablet-dark-valid.png`, 705 × 900 pixels and CSS viewport, Chrome. The earlier IAB tablet capture was clipped by its panel and is excluded from acceptance evidence.
- Screenshot output uses CSS-size pixels; screenshots and source crops were not stretched. Original artwork remains the same 1340 × 1174 WebP. No creative raster editing or image regeneration was performed.

## Comparison history

1. **Blocked:** the source/before combined input confirmed the missing top/bottom fade. Applied the mask to the actual image bounds and removed the dark rounded boundary.
2. **Blocked:** `02-desktop-dark.png` revealed the pale left edge behind the headline. Adjusted the dark horizontal fade; `03-desktop-dark-final.png` shows the corrected separation.
3. **Passed:** opened the combined source/final and Light/Dark mobile comparisons, plus the actual tablet screenshot. All edges blend into the page; the complete course preview and planning note remain visible and the caption stays crisp. The reference has no separate Dark or mobile composition, so those states were checked for consistent feathering, readable copy and responsive usability rather than invented pixel-exact targets.

This is a focused correction to the hero. The prior complete release QA is preserved at `outputs/hero-feather-2026-10-26/previous-release-qa.md`. The current combined full hero is also the focused region: its image boundaries, caption, copy and central preview are readable without a further crop.

## Required fidelity surfaces

- **Typography:** existing Inter/Noto Serif hierarchy, line breaks and exact logo are unchanged. Final Dark copy remains readable against its background.
- **Spacing/layout rhythm:** image retains its natural ratio and centered placement. Desktop headline, CTA and caption positions remain stable. No horizontal document overflow at 1440, 705 or 390 CSS px.
- **Colors/tokens:** established warm Light and near-black Dark backgrounds remain unchanged. Alpha masks blend into the actual theme background rather than a fixed-color overlay.
- **Image quality:** real approved artwork, sharp center, no new compression, no whole-image blur. Top, bottom, left and right edges feather; caption is unmasked. The slightly stronger bottom fade directly addresses the requested effect. Existing generated photographic detail differs from the mock as previously accepted.
- **Copy/content:** unchanged product explanation, example labels, CTA and caption. No backend, payment or publishing behavior changed.

## Checks and limits

Production build, existing public-home regression check and `git diff --check` passed. Light/Dark switching and theme persistence through reload were checked in the browser. The homepage browser logs returned no entries. Safari-specific runtime verification was not available; prefixed mask syntax is included alongside the standard syntax. No live records, provider calls, credentials or payment settings were changed.

Implementation checklist: raster-bound feathering applied; center/caption preserved; Dark headline contrast repaired; phone fade adapted; browser evidence reviewed; production build and focused checks passed.

final result: passed
