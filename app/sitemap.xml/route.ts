import {publicSitePaths, SEO_ORIGIN, sitemapXml} from '@/lib/seo';

export function GET() {
  return new Response(sitemapXml(publicSitePaths.map(path => SEO_ORIGIN + path)), {headers: {'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600'}});
}
