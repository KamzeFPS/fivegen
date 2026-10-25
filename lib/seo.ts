import type {Metadata} from 'next';

/** Public brand URLs are fixed, never derived from an untrusted request Host. */
export const SEO_ORIGIN = 'https://www.fivegen.ai';
export const DOCS_SEO_ORIGIN = 'https://docs.fivegen.ai';
export const SEO_SITE_NAME = 'FiveGen';
export const SEO_HOME_TITLE = 'FiveGen — AI Growth Workspace for Creators';
export const SEO_DESCRIPTION = 'Create and sell your own courses and digital products with FiveGen. Build a sales page, plan your content funnel, organize campaigns and manage customers in one workspace.';
export const SEO_LOGO = SEO_ORIGIN + '/brand/fivegen-sparkle-mark.png';

export type SearchQuery = Record<string, string | string[] | undefined>;

/** Only the anonymous marketing homepage is indexable at the shared root URL. */
export function isPublicHomeQuery(query: SearchQuery) {
  return Object.keys(query).every(key => /^utm_[a-z0-9_]+$/i.test(key) || ['gclid','dclid','fbclid','msclkid','ttclid','gbraid','wbraid'].includes(key));
}

export function publicPageMetadata({title, description, path, docs = false}: {title: string; description: string; path: string; docs?: boolean}): Metadata {
  if (!path.startsWith('/') || path.startsWith('//') || /[?#\\\s]/.test(path)) throw new Error('Public SEO paths must be absolute paths without a query or fragment.');
  const origin = docs ? DOCS_SEO_ORIGIN : SEO_ORIGIN;
  const url = origin + (path === '/' ? '/' : path.replace(/\/$/, ''));
  const siteName = docs ? 'FiveGen Docs' : SEO_SITE_NAME;
  return {
    title: {absolute: title},
    description,
    alternates: {canonical: url},
    robots: {index: true, follow: true, googleBot: {index: true, follow: true, 'max-image-preview': 'large'}},
    openGraph: {type: 'website', locale: 'en_US', siteName, url, title, description, images: [{url: SEO_LOGO, width: 512, height: 512, alt: 'FiveGen logo'}]},
    twitter: {card: 'summary', title, description, images: [{url: SEO_LOGO, alt: 'FiveGen logo'}]},
  };
}

export function privatePageMetadata(title = 'Your workspace · FiveGen'): Metadata {
  return {title: {absolute: title}, robots: {index: false, follow: false, googleBot: {index: false, follow: false}}};
}

/** Owned public marketing pages only; creator records are not enumerated here. */
export const publicSitePaths = ['/', '/pricing', '/terms', '/privacy', '/refund'] as const;

export function sitemapXml(urls: readonly string[]) {
  const escape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls.map(url => `<url><loc>${escape(url)}</loc></url>`).join('') + '</urlset>\n';
}

export function mainRobotsText() {
  // No blanket query/HTML disallow: Google must be able to read noindex on
  // workspace, sign-in and checkout pages. Authentication remains the boundary.
  return `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${SEO_ORIGIN}/sitemap.xml\n`;
}

export function homeStructuredData() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {'@type': 'Organization', '@id': SEO_ORIGIN + '/#organization', name: SEO_SITE_NAME, alternateName: 'FiveGen AI', url: SEO_ORIGIN + '/', logo: {'@type': 'ImageObject', url: SEO_LOGO, width: 512, height: 512}},
      {'@type': 'WebSite', '@id': SEO_ORIGIN + '/#website', name: SEO_SITE_NAME, alternateName: ['FiveGen AI', 'fivegen.ai'], url: SEO_ORIGIN + '/', description: SEO_DESCRIPTION, publisher: {'@id': SEO_ORIGIN + '/#organization'}, inLanguage: 'en'},
    ],
  };
}

/** Keep all JSON-LD safe even when a future description contains HTML text. */
export function jsonLd(data: unknown) {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
