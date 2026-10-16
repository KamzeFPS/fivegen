import { z } from 'zod';
import { ApiError, binding, database } from './server';
import { getPublicFunnel, limitLeadCapture } from './growth-funnel-server';
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
  days: number; mode: 'test'|'live'; visits: number; plays: number; clicks: number; leads: number; bookings: number; purchases: number;
  revenue: { currency: string; amount: number; orders: number }[];
  trend: { day: string; visits: number; leads: number; purchases: number }[];
  sources: { campaign: string; visits: number; clicks: number }[];
  products: { id: string; title: string; published: boolean; visits: number; leads: number; purchases: number }[];
  actions: { title: string; reason: string; label: string; href: string }[];
};
export async function growthDashboard(owner: string, days: number): Promise<GrowthDashboardData> {
  if (![7,30,90].includes(days)) throw new ApiError('Choose a 7, 30, or 90 day period.');
  // Match summary totals to the exact UTC calendar dates displayed in the chart.
  const db = database(), now = Date.now(), today = Math.floor(now / 86400000) * 86400000, from = today - (days - 1)*86400000, mode = binding('STRIPE_MODE') === 'live' ? 'live' : 'test';
  const results = await Promise.all([
    db.prepare("SELECT event,COUNT(*) n FROM growth_events WHERE owner=? AND created_at>=? GROUP BY event").bind(owner,from).all(),
    db.prepare('SELECT COUNT(*) n FROM growth_leads WHERE owner=? AND created_at>=?').bind(owner,from).first(),
    db.prepare("SELECT COUNT(*) n FROM commerce_bookings WHERE owner=? AND mode=? AND status='confirmed' AND created_at>=?").bind(owner,mode,from).first(),
    db.prepare("SELECT currency,COUNT(*) n,COALESCE(SUM(amount),0) amount FROM commerce_orders WHERE owner=? AND mode=? AND status='paid' AND paid_at>=? GROUP BY currency").bind(owner,mode,from).all(),
    db.prepare("SELECT day,COUNT(*) n FROM growth_events WHERE owner=? AND created_at>=? AND event='visit' GROUP BY day").bind(owner,from).all(),
    db.prepare("SELECT strftime('%Y-%m-%d',created_at/1000,'unixepoch') day,COUNT(*) n FROM growth_leads WHERE owner=? AND created_at>=? GROUP BY day").bind(owner,from).all(),
    db.prepare("SELECT strftime('%Y-%m-%d',paid_at/1000,'unixepoch') day,COUNT(*) n FROM commerce_orders WHERE owner=? AND mode=? AND status='paid' AND paid_at>=? GROUP BY day").bind(owner,mode,from).all(),
    db.prepare("SELECT campaign,SUM(CASE WHEN event='visit' THEN 1 ELSE 0 END) visits,SUM(CASE WHEN event='cta' THEN 1 ELSE 0 END) clicks FROM growth_events WHERE owner=? AND created_at>=? GROUP BY campaign ORDER BY visits DESC LIMIT 10").bind(owner,from).all(),
    db.prepare(`SELECT p.id,p.title,f.published_at,
      (SELECT COUNT(*) FROM growth_events e WHERE e.product_id=p.id AND e.owner=p.owner AND e.event='visit' AND e.created_at>=?) visits,
      (SELECT COUNT(*) FROM growth_leads l WHERE l.product_id=p.id AND l.owner=p.owner AND l.created_at>=?) leads,
      (SELECT COUNT(*) FROM commerce_orders o WHERE o.product_id=p.id AND o.owner=p.owner AND o.mode=? AND o.status='paid' AND o.paid_at>=?) purchases
      FROM products p LEFT JOIN growth_funnels f ON f.product_id=p.id AND f.owner=p.owner WHERE p.owner=? ORDER BY p.updated_at DESC LIMIT 100`).bind(from,from,mode,from,owner).all(),
    db.prepare("SELECT COUNT(*) n FROM growth_leads WHERE owner=? AND status='new'").bind(owner).first(),
    db.prepare("SELECT COUNT(*) n FROM automation_sequences WHERE owner=? AND status='active'").bind(owner).first(),
  ]);
  const [events,leadCount,bookings,revenue,visitsByDay,leadsByDay,salesByDay,sources,products,newLeads,sequences] = results;
  const count = (event: string) => Number(events.results.find(r=>r.event===event)?.n||0);
  const series = (rows: Record<string,unknown>[]) => new Map(rows.map(r=>[String(r.day),Number(r.n)]));
  const visitDays=series(visitsByDay.results),leadDays=series(leadsByDay.results),saleDays=series(salesByDay.results);
  const trend = Array.from({length:days},(_,i)=>{const day = new Date(now-(days-1-i)*86400000).toISOString().slice(0,10);return {day,visits:visitDays.get(day)||0,leads:leadDays.get(day)||0,purchases:saleDays.get(day)||0};});
  const productRows=products.results.map(r=>({id:String(r.id),title:String(r.title),published:!!r.published_at,visits:Number(r.visits),leads:Number(r.leads),purchases:Number(r.purchases)}));
  const actions: GrowthDashboardData['actions'] = [];
  if (!productRows.length) actions.push({title:'Create your first product',reason:'Add your course, resource, or mentorship offer. Its content and marketing stay together in one place.',label:'Create your product',href:'/?view=create'});
  const contactCount=Number(newLeads?.n||0);
  if(contactCount>0)actions.push({title:`Follow up with ${contactCount} new ${contactCount===1?'contact':'contacts'}`,reason:contactCount===1?'One contact is still marked New in Customers. Open their details to plan your follow-up.':`${contactCount} contacts are still marked New in Customers. Open their details to plan your follow-up.`,label:contactCount===1?'View contact':'View contacts',href:'/?view=crm'});
  const unpublished=productRows.find(p=>!p.published),published=productRows.find(p=>p.published);
  if(unpublished)actions.push({title:published?'Finish a product’s landing page':'Publish your first landing page',reason:`“${unpublished.title}” does not have a published landing page yet. Review it before sharing it with people.`,label:'Review landing page',href:`/?project=${unpublished.id}&area=funnel`});
  const needsOffer=productRows.find(p=>p.visits>=30&&p.leads===0&&p.purchases===0);
  if(needsOffer)actions.push({title:'Review an offer that is not getting responses',reason:`“${needsOffer.title}” had ${needsOffer.visits} recorded page visits but no new contacts or sales in this period. Use Offer Lab to review who it serves and what it promises.`,label:'Review offer',href:`/?project=${needsOffer.id}&area=offer`});
  if(!Number(sequences?.n)&&published)actions.push({title:'Prepare your welcome emails',reason:'No email sequences are active. Write and approve a welcome for people who agree to receive your emails.',label:'Open email automations',href:`/?project=${published.id}&area=automations`});
  if(!actions.length&&productRows[0])actions.push({title:'Prepare your next promotion',reason:'Turn one of your own recordings into posts and emails for your product.',label:'Open campaigns',href:`/?project=${productRows[0].id}&area=campaigns`});
  return { days,mode,visits:count('visit'),plays:count('vsl_play'),clicks:count('cta'),leads:Number(leadCount?.n||0),bookings:Number(bookings?.n||0),purchases:revenue.results.reduce((n,r)=>n+Number(r.n),0),
    revenue:revenue.results.map(r=>({currency:String(r.currency),amount:Number(r.amount),orders:Number(r.n)})),trend,sources:sources.results.map(r=>({campaign:String(r.campaign),visits:Number(r.visits),clicks:Number(r.clicks)})),products:productRows,actions:actions.slice(0,4) };
}
