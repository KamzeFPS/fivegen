# Product readiness and downloads

`evaluateProductReadiness` in `lib/product-readiness.ts` checks the current draft without modifying it or calling AI. `ProductReadiness` presents required fixes, optional improvements, and exact editor locations. Server asset validation remains authoritative. Pass saved server checks only when the editor has no unsaved changes; otherwise their messages describe an older draft.

Required fixes cover missing essentials, empty added sections/resources, obvious whole-field drafting stubs, missing known uploads/recordings, and the existing delivery requirements for each product family. Whole-field `TODO`, `TBD`, `[Insert chapter content here]`, and similar stubs are blocked server-side too. A code lesson discussing TODO comments is valid; reusable templates may intentionally contain replacement fields.

Repeated chapter bodies or longer passages, embedded drafting markers, brief content, missing optional product details, covers, learning objectives, exercises, and a shorter-than-promised sequence are editorial advice. They never create an arbitrary new sales gate. Multiple aggregate/server failures for one empty item appear as one fix; explicit integrity failures remain distinct. Payment eligibility is separate from content readiness.

An uploaded finished PDF can be the complete book, guide, or playbook. It needs no fake chapters. Recording-only course lessons remain valid. The checker does not inspect or claim to verify the substance of private uploaded PDFs/videos, factual accuracy, licensing, or likely sales.

`productHtml` creates a self-contained printable HTML reader with a typographic cover, subtitle, linked contents, consistent chapter hierarchy, learning objectives, readable lists/tables/code, exercise callouts, checkboxes, and included editable resources. Long cover descriptions/subtitles move in full to the introduction rather than overflowing or disappearing. The authenticated builder export embeds a verified owned cover of up to 8 MB; unavailable, corrupt, unsupported, or larger covers use the typographic design. Original files and private recordings retain their separate delivery paths. This is printable HTML; use the browser’s Print → Save as PDF for a PDF.

User HTML is escaped. A restrictive content-security policy prevents scripts, forms, remote media, and third-party requests in the download. Private recording IDs/URLs and service/community invitation links are not embedded in the printable reader.

Run `node scripts/product-quality-test.mjs` for all 11 product families, false-positive protection, fix deduplication, preserved originals, export safety, metadata overflow handling, and cover integrity. Run `node scripts/product-builder-test.mjs` for actual server publication/storage enforcement. Both use synthetic retained fixtures and no paid provider calls. Visual export evidence is produced under `outputs/product-quality-qa`.
