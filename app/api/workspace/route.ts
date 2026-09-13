import { database, failure, identity, productFromRow } from '@/lib/server';
import { providerSettings } from '@/lib/ai';
import { isAdmin } from '@/lib/admin';
import { creditBalance } from '@/lib/credits';
import { textCredits } from '@/lib/credit-policy';
export async function GET() {
  try {
    const user=await identity();
    const [products,ai,credits]=await Promise.all([
      database().prepare('SELECT * FROM products WHERE owner=? ORDER BY updated_at DESC').bind(user.userId).all(),
      providerSettings(),creditBalance(user.userId),
    ]);
    return Response.json({admin:isAdmin(user),products:products.results.map(productFromRow),credits,textCost:textCredits(ai.config.textProvider),capabilities:{ai:ai.connected[ai.config.textProvider]&&!ai.config.paused,media:ai.connected.fal&&!ai.config.paused}});
  }catch(error){return failure(error);}
}
