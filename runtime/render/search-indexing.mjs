// Search controls supplement authentication; they never grant access to content.
// Keep tracking links indexable at the public home, while every workspace query
// is allowed to be crawled far enough to read its noindex response.
export function publicHomeSearch(searchParams) {
  return [...searchParams.keys()].every(key => /^utm_[a-z0-9_]+$/i.test(key) || ['gclid', 'dclid', 'fbclid', 'msclkid', 'ttclid', 'gbraid', 'wbraid'].includes(key));
}

export function privateSearchResponse(path, searchParams = new URLSearchParams(), authenticated = false) {
  if (authenticated) return true;
  if (path === '' || path === '/') return !publicHomeSearch(searchParams);
  return /^\/(?:api|account|admin|build|checkout|collaborate|invite|access|learn|customer|oauth|operations|unsubscribe|welcome|sell|s|o)(?:\/|$)/.test(path) ||
    /^\/(?:signin|signup|forgot-password|verify-email|reset-password|signin-with-chatgpt|signout-with-chatgpt|callback)(?:\/|$)/.test(path);
}
