# FiveGen search discovery

The public, signed-out homepage explains FiveGen and links to pricing and documentation in server-rendered HTML. Signed-in creators retain their existing workspace at the same root path. Only marketing tracking parameters retain the public homepage; workspace and unknown query parameters receive `noindex`.

## Public search signals

- Canonical site: `https://www.fivegen.ai/`. The runtime redirects the apex domain to this configured host.
- Main sitemap: `https://www.fivegen.ai/sitemap.xml`, containing the homepage, pricing and the maintained terms/privacy/refund pages. It never enumerates private products or workspace records.
- Documentation sitemap: `https://docs.fivegen.ai/sitemap.xml`. Documentation has its own canonicals and robots file.
- The main robots file permits public HTML and assets, advertises its sitemap and excludes API crawling. Search exclusions use metadata and HTTP `X-Robots-Tag`; robots restrictions are not an access-control boundary.
- The homepage identifies the actual FiveGen / FiveGen AI brand using `WebSite` and `Organization` JSON-LD. It does not invent ratings, addresses, customer totals, social profiles or review authors.
- Stable PNG icons are generated from the existing tracked brand mark: `favicon-96.png`, `apple-touch-icon.png` and `fivegen-mark.png`.
- Published creator pages retain their own canonicals and indexing rules. Account, editor, checkout, token and authenticated responses remain outside search.

## Search Console operations

The approved HTML verification file is `public/googleb7396844c362c0a5.html`. It was downloaded from the owner's Search Console session. Keep it available at the canonical root after ownership verification; do not replace it with a different account's token without the owner's approval.

After a deployment, verify the public response anonymously, confirm that the sitemap is retrievable, then use the owning Search Console account to submit `/sitemap.xml`. Inspect the homepage, test the live URL and request indexing if appropriate. The release's actual verification/submission results are recorded separately in `outputs/seo-release-2026-10-25/`.

The verified URL-prefix property covers `https://www.fivegen.ai/`. It does not grant ownership of `docs.fivegen.ai`, other protocols or the apex host. A future Domain property requires DNS ownership verification and can cover those variants together.

Google decides whether and when to crawl, index, rank and show rich results. A successful request is not a promise of a listing, rank, review stars or a Knowledge Panel. Search Console is the source for actual indexing diagnosis; a search query or missing sitemap alone does not establish index status.

## Reviews and business profiles

An online-only software business generally does not qualify for Google Business Profile. Do not create an invented customer-facing address. Organization or LocalBusiness self-reviews do not qualify for organization review stars. Software review markup requires genuine, visible product reviews and the required accurate product/offer information; no aggregate is included without that evidence.

Primary guidance: [ownership verification](https://support.google.com/webmasters/answer/9008080), [sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [request crawling](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl), [site names](https://developers.google.com/search/docs/appearance/site-names), [business eligibility](https://support.google.com/business/answer/13763036), and [review snippets](https://developers.google.com/search/docs/appearance/structured-data/review-snippet).

## Verification

Run `npm run test:seo`, the production build and `npm run test:render:integration`. The latter exercises the actual anonymous public page, sitemap/robots MIME types and locations, verification file, PNG favicon and private/authenticated HTTP search boundaries alongside the existing authentication and persistence checks. Inspect the public homepage on desktop and phone before deployment.
