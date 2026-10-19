import { z } from 'zod';
import { ApiError, database } from './server';
import { reserveCredits, refundCredits } from './credits';
export const creatorRunInput = z.object({ expectedUpdatedAt: z.number().int().positive(), requestId: z.string().uuid(), maxCredits: z.number().int().min(0).max(30) });
type Kind = 'campaign' | 'transcript';
function target(kind: Kind) { return kind === 'campaign' ? { table: 'creator_campaigns', id: 'product_id' } : { table: 'creator_voice_sources', id: 'id' }; }
export async function recoverCreatorRuns(kind: Kind, targetId: string, owner: string) {
  const db = database(), now = Date.now(), t = target(kind);
  const rows = await db.prepare("SELECT id FROM creator_ai_runs WHERE owner=? AND kind=? AND target_id=? AND state='pending' AND created_at<=? LIMIT 50").bind(owner, kind, targetId, now - 180000).all();
  for (const row of rows.results) {
    await db.batch([
      db.prepare(`UPDATE ${t.table} SET lease=0,lease_id=NULL WHERE ${t.id}=? AND owner=? AND lease_id=? AND lease<=?`).bind(targetId, owner, row.id, now),
      db.prepare(`UPDATE creator_ai_runs SET state='failed' WHERE id=? AND state='pending' AND NOT EXISTS(SELECT 1 FROM ${t.table} WHERE ${t.id}=? AND owner=? AND lease_id=? AND lease>?)`).bind(row.id, targetId, owner, row.id, now),
    ]);
  }
  const refunds = await db.prepare("SELECT r.id FROM creator_ai_runs r JOIN credit_usage c ON c.id=r.id WHERE r.owner=? AND r.kind=? AND r.target_id=? AND r.state='failed' AND c.state='reserved' LIMIT 50").bind(owner, kind, targetId).all();
  for (const row of refunds.results) await refundCredits(String(row.id));
}
export async function previousCreatorRun(kind: Kind, targetId: string, owner: string, input: z.infer<typeof creatorRunInput>) {
  await recoverCreatorRuns(kind, targetId, owner);
  const row = await database().prepare('SELECT * FROM creator_ai_runs WHERE id=?').bind(input.requestId).first();
  if (!row) return null;
  if (row.owner !== owner || row.kind !== kind || row.target_id !== targetId || Number(row.expected_updated_at) !== input.expectedUpdatedAt) throw new ApiError('This request reference was already used.', 409);
  if (row.state === 'completed') return JSON.parse(String(row.response));
  throw new ApiError(row.state === 'failed' ? 'This attempt failed. Start a new attempt to retry.' : 'This request is still running. Reload before retrying.', 409);
}
export async function runCreatorAI<T>(kind: Kind, targetId: string, owner: string, input: z.infer<typeof creatorRunInput>, cost: number, generate: () => Promise<T>, commit: (result: T, now: number) => D1PreparedStatement) {
  if (cost > input.maxCredits) throw new ApiError(`This run needs ${cost} credits. Review the cost before continuing.`, 402);
  const db = database(), t = target(kind), now = Date.now();
  const claim = await db.prepare(`UPDATE ${t.table} SET lease=?,lease_id=? WHERE ${t.id}=? AND owner=? AND updated_at=? AND lease<?`).bind(now + 180000, input.requestId, targetId, owner, input.expectedUpdatedAt, now).run();
  if (!claim.meta.changes) throw new ApiError('This workspace changed or AI is already working. Reload before continuing.', 409);
  let charged = false, created = false;
  try {
    await db.prepare("INSERT INTO creator_ai_runs (id,owner,kind,target_id,expected_updated_at,state,cost,created_at) VALUES (?,?,?,?,?,'pending',?,?)").bind(input.requestId, owner, kind, targetId, input.expectedUpdatedAt, cost, now).run(); created = true;
    if (cost) { await reserveCredits(owner, input.requestId, 'text', cost); charged = true; }
    const generated = await generate(), updatedAt = Math.max(Date.now(), input.expectedUpdatedAt + 1), response = { result: generated, updatedAt, spent: cost };
    const committed = await db.batch([
      commit(generated, updatedAt),
      db.prepare(`UPDATE creator_ai_runs SET state='completed',response=? WHERE id=? AND EXISTS(SELECT 1 FROM ${t.table} WHERE ${t.id}=? AND owner=? AND updated_at=? AND lease_id=?)`).bind(JSON.stringify(response), input.requestId, targetId, owner, updatedAt, input.requestId),
      db.prepare("UPDATE credit_usage SET state='completed' WHERE id=? AND state='reserved' AND EXISTS(SELECT 1 FROM creator_ai_runs WHERE id=? AND state='completed')").bind(input.requestId, input.requestId),
    ]);
    if (!committed[0].meta.changes) throw new ApiError('Your workspace or source material changed while AI was working. Your newer work was kept.', 409);
    charged = false; return response;
  } catch (error) {
    if (created) await db.prepare("UPDATE creator_ai_runs SET state='failed' WHERE id=? AND state='pending'").bind(input.requestId).run();
    if (charged) await refundCredits(input.requestId);
    throw error;
  } finally { await db.prepare(`UPDATE ${t.table} SET lease=0 WHERE ${t.id}=? AND owner=? AND lease_id=?`).bind(targetId, owner, input.requestId).run(); }
}
