// Historical records, renewals, webhooks and portal sessions remain valid.
export async function POST() {
  return Response.json({error:'Checkout has moved to Apple Pay and Google Pay.',url:'/pricing'},{status:410});
}
