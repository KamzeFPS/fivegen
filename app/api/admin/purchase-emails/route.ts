import {requireAdmin} from '@/lib/admin';
import {database,failure} from '@/lib/server';
import {purchaseEmailReadiness} from '@/lib/purchase-email';
export async function GET(){
  try{
    await requireAdmin();const db=database(),[readiness,counts,recent]=await Promise.all([
      purchaseEmailReadiness(),
      db.prepare('SELECT status,COUNT(*) AS count FROM purchase_emails GROUP BY status').all(),
      db.prepare('SELECT id,order_id,source,mode,status,attempts,created_at,sent_at,provider_id,error FROM purchase_emails ORDER BY created_at DESC LIMIT 30').all(),
    ]);
    return Response.json({readiness,counts:Object.fromEntries(counts.results.map(row=>[String(row.status),Number(row.count)])),recent:recent.results},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return failure(error);}
}
