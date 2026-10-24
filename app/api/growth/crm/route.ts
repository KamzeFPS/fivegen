import { z } from "zod";
import { ApiError, database, failure, identity, sameOrigin,ownedProduct } from "@/lib/server";
import {customerContextEmail} from '@/lib/customer-context-server';
import { leadStatuses } from "@/lib/growth-funnel";
import { leadFromRow } from "@/lib/growth-funnel-server";

const updateSchema = z.object({ id: z.string().uuid(), status: z.enum(leadStatuses), notes: z.string().max(10000), expectedUpdatedAt: z.number().int().min(0) });
export async function GET(request: Request) {
  try {
    const user = await identity(), query = new URL(request.url).searchParams;
    const search = (query.get("q") || "").trim().slice(0, 150), status = query.get("status") || "";
    if (status && !leadStatuses.includes(status as typeof leadStatuses[number])) throw new ApiError("Choose a valid lead status.");
    const product=(query.get("product")||"").slice(0,100);if(product)await ownedProduct(product,user.userId);const offset = Number(query.get("offset") || 0);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new ApiError("Invalid page.");
    const condition = "l.owner=? AND (?='' OR instr(lower(l.name||' '||l.email||' '||p.title),lower(?))>0) AND (?='' OR l.status=?) AND (?='' OR l.product_id=?)";
    const args = [user.userId, search, search, status, status,product,product];
    const rows = await database().prepare(`SELECT l.*,p.title AS product_title FROM growth_leads l JOIN products p ON p.id=l.product_id AND p.owner=l.owner WHERE ${condition} ORDER BY l.created_at DESC,l.id DESC LIMIT 100 OFFSET ?`).bind(...args, offset).all();
    const total = await database().prepare(`SELECT COUNT(*) AS count FROM growth_leads l JOIN products p ON p.id=l.product_id AND p.owner=l.owner WHERE ${condition}`).bind(...args).first();
    const reference=(query.get('person')||'').slice(0,300),email=reference?await customerContextEmail(user.userId,reference,product):'',selected=email?await database().prepare("SELECT l.*,p.title product_title FROM growth_leads l JOIN products p ON p.id=l.product_id AND p.owner=l.owner WHERE l.owner=? AND lower(l.email)=? AND (?='' OR l.product_id=?) ORDER BY l.last_seen_at DESC LIMIT 1").bind(user.userId,email,product,product).first():null;
    return Response.json({ selectedLead:selected?leadFromRow(selected):null,contextError:reference&&!selected?'This person has no signup record in the selected product. Check their purchase or application history instead.':'', leads: rows.results.map(leadFromRow), total: Number(total?.count || 0), nextOffset: offset + rows.results.length < Number(total?.count || 0) ? offset + rows.results.length : null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return failure(error); }
}
export async function PATCH(request: Request) {
  try {
    sameOrigin(request); const user = await identity(), input = updateSchema.parse(await request.json());
    const current = await database().prepare("SELECT id FROM growth_leads WHERE id=? AND owner=?").bind(input.id, user.userId).first();
    if (!current) throw new ApiError("Lead not found.", 404);
    const result = await database().prepare("UPDATE growth_leads SET status=?,notes=?,updated_at=MAX(updated_at+1,?) WHERE id=? AND owner=? AND updated_at=?").bind(input.status, input.notes, Date.now(), input.id, user.userId, input.expectedUpdatedAt).run();
    if (!result.meta.changes) throw new ApiError("This lead changed. Refresh before saving.", 409);
    const row = await database().prepare("SELECT l.*,p.title AS product_title FROM growth_leads l JOIN products p ON p.id=l.product_id AND p.owner=l.owner WHERE l.id=? AND l.owner=?").bind(input.id, user.userId).first();
    return Response.json({ lead: leadFromRow(row!) });
  } catch (error) { return failure(error); }
}
