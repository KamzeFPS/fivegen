// New commerce is permanently disabled. Historical webhooks, authenticated
// receipts and paid download entitlements remain available for fulfillment.
export function retiredCommercePath(path:string) {
  try { path=decodeURIComponent(path); } catch { return true; }
  return /^\/(?:p|f|r|invite)(?:\/|$)/.test(path)
    || /^\/partners(?:\/|$)/.test(path)
    || /^\/api\/(?:checkout|quote|connect\/stripe|referrals|invite|leads|visits|crm)(?:\/|$)/.test(path)
    || /^\/api\/products\/[^/]+\/slots(?:\/|$)/.test(path);
}
export function commerceGone() {
  return Response.json({error:'FiveGen is now a private AI creation studio. Storefront checkout, publishing, referrals and seller payouts are no longer available.'},{status:410,headers:{'Cache-Control':'no-store'}});
}
