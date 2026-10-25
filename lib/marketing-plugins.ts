import { z } from 'zod';

// Growth plan and Results are permanent. Funnel Builder is a default shortcut only
// when no preference has been saved; saved visibility choices remain authoritative.
export const marketingPluginIds = ['voice', 'vsl', 'funnel-builder', 'funnel', 'campaigns', 'automations', 'offer'] as const;
export type MarketingPluginId = typeof marketingPluginIds[number];
export const defaultMarketingPluginIds:MarketingPluginId[]=['funnel-builder'];
export const marketingWorkspaceAreas=['dashboard','results',...marketingPluginIds] as const;
export function isMarketingWorkspaceArea(value:unknown):value is typeof marketingWorkspaceAreas[number]{return typeof value==='string'&&(marketingWorkspaceAreas as readonly string[]).includes(value);}
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
