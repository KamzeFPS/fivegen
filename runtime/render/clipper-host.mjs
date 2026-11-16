/** The clipping hostname is a public surface. Account sessions and campaign
 * actions stay at the canonical application origin with its host-only cookie. */
export function readClipperOrigin(source, appOrigin) {
  const app = new URL(appOrigin);
  const raw = source.CLIPPER_ORIGIN?.trim() ||
    (['fivegen.ai', 'www.fivegen.ai'].includes(app.hostname) ? 'https://clipper.fivegen.ai' : '');
  if (!raw) return null;
  const url = new URL(raw);
  if (url.pathname !== '/' || url.search || url.hash || url.username || url.password || url.host === app.host ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', 'clipper.localhost'].includes(url.hostname))))
    throw new Error('CLIPPER_ORIGIN must be a separate HTTPS origin');
  return url.origin;
}

export function clipperHostRequest({clipperOrigin, host, method, path}) {
  if (!clipperOrigin || host !== new URL(clipperOrigin).host) return null;
  let pathname;
  try { pathname = decodeURIComponent(path); } catch { return {status: 400}; }
  if (pathname.includes('\\') || pathname.includes('//') || pathname.includes('%') || /[\u0000-\u001f\u007f]/.test(pathname) ||
      pathname.split('/').some(part => part === '.' || part === '..')) return {status: 400};
  if (!['GET', 'HEAD'].includes(method)) return {status: 405};
  // Preserve the complete member destination through the existing sign-in and
  // terms flow. Do not broaden the session cookie to sibling subdomains.
  if (/^\/clipper\/(?:app|admin)(?:\/|$)/.test(pathname) ||
      /^\/(?:signin|signup|signin-with-chatgpt|signout-with-chatgpt|forgot-password|reset-password|verify-email|callback|welcome|terms|privacy|refund)\/?$/.test(pathname))
    return {status: 303, path: pathname, canonical: true};
  if (pathname === '/') return {status: 200, path: '/clipper'};
  if (/^\/clipper\/?$/.test(pathname) || /^\/clipper\/campaigns(?:\/[a-zA-Z0-9-]+)?\/?$/.test(pathname))
    return {status: 200, path: pathname.replace(/\/$/, '')};
  if (/^\/api\/clipper(?:\/[a-zA-Z0-9-]+)*\/?$/.test(pathname)) return {status: 200, path: pathname};
  if (/^\/(?:assets|_next|brand|fonts)\/[a-zA-Z0-9_./-]+$/.test(pathname) || pathname === '/favicon.ico')
    return {status: 200, path: pathname};
  if (pathname === '/robots.txt') return {status: 200, text: 'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /clipper/app\nDisallow: /clipper/admin\n'};
  return {status: 404};
}
