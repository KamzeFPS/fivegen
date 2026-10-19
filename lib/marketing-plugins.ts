import { z } from 'zod';

// The product sales dashboard is the permanent marketing home. These tools appear only after the
// product owner explicitly adds them; existing content is not an installation.
export const marketingPluginIds = ['voice', 'vsl', 'funnel', 'campaigns', 'automations', 'offer'] as const;
export type MarketingPluginId = typeof marketingPluginIds[number];
export interface MarketingPluginState {
  installed: MarketingPluginId[];
  updatedAt: number;
}
export const marketingPluginUpdateSchema = z.object({
  pluginId: z.enum(marketingPluginIds),
  enabled: z.boolean(),
  expectedUpdatedAt: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
}).strict();

// Tolerate an absent or damaged persisted preference without opting products
// into a feature. Keep the public list stable and remove unknown/duplicate IDs.
export function readMarketingPluginIds(value: unknown): MarketingPluginId[] {
  let parsed = value;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return []; }
  }
  const candidates: unknown[] = Array.isArray(parsed) ? parsed : [];
  return marketingPluginIds.filter(id => candidates.includes(id));
}
