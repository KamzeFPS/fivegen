import { z } from 'zod';
import { ApiError, binding, database, ownedProduct } from './server';
import { getPublicFunnel, limitLeadCapture } from './growth-funnel-server';
import { readMarketingPluginIds } from './marketing-plugins';
export const growthEventSchema = z.object({ slug: z.string().min(1).max(120), visitor: z.string().uuid(), event: z.enum(['visit','vsl_play','cta']), campaign: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).default('direct') });
export async function trackGrowthEvent(input: unknown) {
  const value = growthEventSchema.parse(input), funnel = await getPublicFunnel(value.slug), now = Date.now();
  await limitLeadCapture(`analytics:${funnel.productId}`, value.visitor);
  await database().prepare(`INSERT OR IGNORE INTO growth_events (id,owner,product_id,visitor,event,campaign,day,created_at)
    SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM growth_funnels WHERE product_id=? AND owner=? AND published_at IS NOT NULL)`)
    .bind(crypto.randomUUID(), funnel.owner, funnel.productId, value.visitor, value.event, value.campaign, new Date(now).toISOString().slice(0,10), now, funnel.productId, funnel.owner).run();
  return { recorded: true };
}
export type GrowthDashboardData = {
  productId: string|null;
  salesCoverage: { source:'connected-checkout'; legacyOrdersExcluded:number };
  days: number; mode: 'test'|'live'; visits: number; plays: number; clicks: number; leads: number; bookings: number; purchases: number;
  revenue: { currency: string; amount: number; orders: number }[];
  trend: { day: string; visits: number; leads: number; purchases: number }[];
  sources: { campaign: string; visits: number; clicks: number }[];
  products: { id: string; title: string; published: boolean; visits: number; leads: number; purchases: number }[];
  actions: { title: string; reason: string; label: string; href: string }[];
};
export async function growthDashboard(owner: string, days: number, productId?: string): Promise<GrowthDashboardData> {
  if (![7,30,90].includes(days)) throw new ApiError('Choose a 7, 30, or 90 day period.');
  if(productId){z.string().uuid().parse(productId);await ownedProduct(productId,owner);}
  // Match summary totals to the exact UTC calendar dates displayed in the chart.
  const db = database(), now = Date.now(), today = Math.floor(now / 86400000) * 86400000, from = today - (days - 1)*86400000, mode = binding('STRIPE_MODE') === 'live' ? 'live' : 'test';
  const scope=' AND (? IS NULL OR product_id=?)', selected=productId||null;
  const results = await Promise.all([
    db.prepare("SELECT event,COUNT(*) n FROM growth_events WHERE owner=? AND created_at>=?"+scope+" GROUP BY event").bind(owner,from,selected,selected).all(),
    db.prepare('SELECT COUNT(*) n FROM growth_leads WHERE owner=? AND created_at>=?'+scope).bind(owner,from,selected,selected).first(),
    db.prepare("SELECT COUNT(*) n FROM commerce_bookings WHERE owner=? AND mode=? AND status='confirmed' AND created_at>=?"+scope).bind(owner,mode,from,selected,selected).first(),
    db.prepare("SELECT currency,COUNT(*) n,COALESCE(SUM(amount),0) amount FROM commerce_orders WHERE owner=? AND mode=? AND status='paid' AND paid_at>=?"+scope+" GROUP BY currency").bind(owner,mode,from,selected,selected).all(),
    db.prepare("SELECT day,COUNT(*) n FROM growth_events WHERE owner=? AND created_at>=? AND event='visit'"+scope+" GROUP BY day").bind(owner,from,selected,selected).all(),
    db.prepare("SELECT strftime('%Y-%m-%d',created_at/1000,'unixepoch') day,COUNT(*) n FROM growth_leads WHERE owner=? AND created_at>=?"+scope+" GROUP BY day").bind(owner,from,selected,selected).all(),
    db.prepare("SELECT strftime('%Y-%m-%d',paid_at/1000,'unixepoch') day,COUNT(*) n FROM commerce_orders WHERE owner=? AND mode=? AND status='paid' AND paid_at>=?"+scope+" GROUP BY day").bind(owner,mode,from,selected,selected).all(),
    db.prepare("SELECT campaign,SUM(CASE WHEN event='visit' THEN 1 ELSE 0 END) visits,SUM(CASE WHEN event='cta' THEN 1 ELSE 0 END) clicks FROM growth_events WHERE owner=? AND created_at>=?"+scope+" GROUP BY campaign ORDER BY visits DESC LIMIT 10").bind(owner,from,selected,selected).all(),
    db.prepare(`SELECT p.id,p.title,p.status,f.published_at,m.installed,
      EXISTS(SELECT 1 FROM product_builder_publications b WHERE b.product_id=p.id AND b.owner=p.owner) builder_published,
      (SELECT COUNT(*) FROM automation_sequences a WHERE a.product_id=p.id AND a.owner=p.owner AND a.status='active') active_sequences,
      (SELECT COUNT(*) FROM growth_events e WHERE e.product_id=p.id AND e.owner=p.owner AND e.event='visit' AND e.created_at>=?) visits,
      (SELECT COUNT(*) FROM growth_leads l WHERE l.product_id=p.id AND l.owner=p.owner AND l.created_at>=?) leads,
      (SELECT COUNT(*) FROM commerce_orders o WHERE o.product_id=p.id AND o.owner=p.owner AND o.mode=? AND o.status='paid' AND o.paid_at>=?) purchases
      FROM products p LEFT JOIN growth_funnels f ON f.product_id=p.id AND f.owner=p.owner LEFT JOIN product_marketing_plugins m ON m.product_id=p.id AND m.owner=p.owner WHERE p.owner=? AND (? IS NULL OR p.id=?) ORDER BY p.updated_at DESC LIMIT 100`).bind(from,from,mode,from,owner,selected,selected).all(),
    db.prepare("SELECT COUNT(*) n FROM growth_leads WHERE owner=? AND status='new'"+scope).bind(owner,selected,selected).first(),
    // Legacy orders have no reliable environment, currency or refund status.
    // Report the coverage gap instead of mixing unverifiable sales into these
    // paid current-checkout totals, or silently presenting missing history as 0.
    db.prepare('SELECT COUNT(*) n FROM orders WHERE owner=? AND created_at>=?'+scope).bind(owner,from,selected,selected).first(),
  ]);
  const [events,leadCount,bookings,revenue,visitsByDay,leadsByDay,salesByDay,sources,products,newLeads,legacyOrders] = results;
  const count = (event: string) => Number(events.results.find(r=>r.event===event)?.n||0);
  const series = (rows: Record<string,unknown>[]) => new Map(rows.map(r=>[String(r.day),Number(r.n)]));
  const visitDays=series(visitsByDay.results),leadDays=series(leadsByDay.results),saleDays=series(salesByDay.results);
  const trend = Array.from({length:days},(_,i)=>{const day = new Date(now-(days-1-i)*86400000).toISOString().slice(0,10);return {day,visits:visitDays.get(day)||0,leads:leadDays.get(day)||0,purchases:saleDays.get(day)||0};});
  const productDetails=products.results.map(r=>({id:String(r.id),title:String(r.title),published:r.status==='published'||!!r.builder_published||!!r.published_at,funnelPublished:!!r.published_at,plugins:readMarketingPluginIds(r.installed),activeSequences:Number(r.active_sequences),visits:Number(r.visits),leads:Number(r.leads),purchases:Number(r.purchases)}));
  const productRows=productDetails.map(({funnelPublished,plugins,activeSequences,...product})=>product);
  const actions: GrowthDashboardData['actions'] = [];
  if (!productRows.length) actions.push({title:'Create your first product',reason:'Add your course, resource, or service. Marketing plugins are available whenever you need them.',label:'Create your product',href:'/?view=create'});
  const contactCount=Number(newLeads?.n||0);
  if(contactCount>0)actions.push({title:`Follow up with ${contactCount} new ${contactCount===1?'contact':'contacts'}`,reason:contactCount===1?'One contact is still marked New in Customers. Open their details to plan your follow-up.':`${contactCount} contacts are still marked New in Customers. Open their details to plan your follow-up.`,label:contactCount===1?'View contact':'View contacts',href:'/?view=crm'});
  const unpublished=productRows.find(p=>!p.published);
  if(unpublished)actions.push({title:'Finish your product',reason:`“${unpublished.title}” is still a draft. Review its content and publishing options when you’re ready to share it.`,label:'Open product',href:`/?project=${unpublished.id}&area=content`});
  const unfinishedFunnel=productDetails.find(p=>p.published&&p.plugins.includes('funnel')&&!p.funnelPublished);
  if(unfinishedFunnel)actions.push({title:'Review your optional funnel',reason:`You added the Funnel plugin to “${unfinishedFunnel.title}”. Its funnel is still private; publish it only if you want a separate marketing page.`,label:'Open funnel',href:`/?project=${unfinishedFunnel.id}&area=funnel`});
  const needsOffer=productDetails.find(p=>p.plugins.includes('offer')&&p.visits>=30&&p.leads===0&&p.purchases===0);
  if(needsOffer)actions.push({title:'Review an offer that is not getting responses',reason:`“${needsOffer.title}” had ${needsOffer.visits} recorded page visits but no new contacts or sales in this period. Use Offer Lab to review who it serves and what it promises.`,label:'Review offer',href:`/?project=${needsOffer.id}&area=offer`});
  const welcome=productDetails.find(p=>p.plugins.includes('automations')&&p.published&&!p.activeSequences);
  if(welcome)actions.push({title:'Prepare your welcome emails',reason:`The Automations plugin is enabled for “${welcome.title}”, with no active sequence. Write and approve a welcome for people who agree to receive your emails.`,label:'Open email automations',href:`/?project=${welcome.id}&area=automations`});
  const promotion=productDetails.find(p=>p.plugins.includes('campaigns'));
  if(!actions.length&&promotion)actions.push({title:'Prepare your next promotion',reason:'Use your Campaigns plugin to turn one of your own recordings into posts and emails for your product.',label:'Open campaigns',href:`/?project=${promotion.id}&area=campaigns`});
  return { productId:selected,salesCoverage:{source:'connected-checkout',legacyOrdersExcluded:Number(legacyOrders?.n||0)},days,mode,visits:count('visit'),plays:count('vsl_play'),clicks:count('cta'),leads:Number(leadCount?.n||0),bookings:Number(bookings?.n||0),purchases:revenue.results.reduce((n,r)=>n+Number(r.n),0),
    revenue:revenue.results.map(r=>({currency:String(r.currency),amount:Number(r.amount),orders:Number(r.n)})),trend,sources:sources.results.map(r=>({campaign:String(r.campaign),visits:Number(r.visits),clicks:Number(r.clicks)})),products:productRows,actions:actions.slice(0,4) };
}
