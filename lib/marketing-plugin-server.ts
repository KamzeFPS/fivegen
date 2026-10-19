import { ApiError, database, ownedProduct } from './server';
import { marketingPluginIds, marketingPluginUpdateSchema, readMarketingPluginIds, type MarketingPluginState } from './marketing-plugins';

export const marketingPluginHeaders = { 'Cache-Control': 'private, no-store' };

export async function getMarketingPlugins(productId: string, owner: string): Promise<MarketingPluginState> {
  await ownedProduct(productId, owner);
  const row = await database().prepare('SELECT installed,updated_at FROM product_marketing_plugins WHERE product_id=? AND owner=?').bind(productId, owner).first();
  return row ? { installed: readMarketingPluginIds(row.installed), updatedAt: Number(row.updated_at) } : { installed: [], updatedAt: 0 };
}

export async function updateMarketingPlugin(productId: string, owner: string, value: unknown): Promise<MarketingPluginState> {
  const input = marketingPluginUpdateSchema.parse(value), previous = await getMarketingPlugins(productId, owner);
  if (previous.updatedAt !== input.expectedUpdatedAt) throw new ApiError('Marketing plugins changed in another tab. Reload them before making another change.', 409);
  if (previous.installed.includes(input.pluginId) === input.enabled) return previous;
  const installed = marketingPluginIds.filter(id => id === input.pluginId ? input.enabled : previous.installed.includes(id));
  const updatedAt = Math.max(Date.now(), previous.updatedAt + 1), db = database();
  // The settings are separate from funnel, campaign, automation and product
  // data. Removing a plugin cannot delete content or stop existing delivery.
  const result = previous.updatedAt === 0
    ? await db.prepare('INSERT INTO product_marketing_plugins (product_id,owner,installed,updated_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM products WHERE id=? AND owner=?) ON CONFLICT(product_id) DO NOTHING').bind(productId, owner, JSON.stringify(installed), updatedAt, productId, owner).run()
    : await db.prepare('UPDATE product_marketing_plugins SET installed=?,updated_at=? WHERE product_id=? AND owner=? AND updated_at=? AND EXISTS(SELECT 1 FROM products WHERE id=? AND owner=?)').bind(JSON.stringify(installed), updatedAt, productId, owner, previous.updatedAt, productId, owner).run();
  if (!result.meta.changes) throw new ApiError('Marketing plugins changed in another tab. Reload them before making another change.', 409);
  return { installed, updatedAt };
}
