import { z } from 'zod';
import { env } from 'cloudflare:workers';
import { ApiError, database, ownedProduct } from './server';
import { providerKey, providerSettings } from './ai';
import { reserveAIBudget } from './credits';
import { hasUnlimitedGeneration } from './generation-access';
import { voiceInputSchema, type VoiceSource, type VoiceContext, type VoiceReference } from './creator-voice';
import { creatorRunInput, previousCreatorRun, recoverCreatorRuns, runCreatorAI } from './campaign-run';

function voiceRow(row: Record<string, unknown>): VoiceSource {
  return { id: String(row.id), productId: String(row.product_id), title: String(row.title), kind: row.kind as VoiceSource['kind'], transcript: String(row.transcript), evidence: String(row.evidence), uploadId: row.upload_id ? String(row.upload_id) : null, uploadAvailable: !!row.upload_available, permission: !!row.permission, approved: !!row.approved, updatedAt: Number(row.updated_at) };
}
const voiceSelect = "SELECT v.*,EXISTS(SELECT 1 FROM uploads u WHERE u.id=v.upload_id AND u.owner=v.owner AND u.status='completed') AS upload_available FROM creator_voice_sources v";
export async function listVoiceSources(owner: string): Promise<VoiceSource[]> {
  const rows = await database().prepare(voiceSelect + ' WHERE v.owner=? ORDER BY v.updated_at DESC LIMIT 100').bind(owner).all();
  return rows.results.map(voiceRow);
}
export async function getVoiceSource(id: string, owner: string): Promise<VoiceSource> {
  const row = await database().prepare(voiceSelect + ' WHERE v.id=? AND v.owner=?').bind(id, owner).first();
  if (!row) throw new ApiError('Voice source not found.', 404);
  await recoverCreatorRuns('transcript', id, owner);
  return voiceRow(row);
}
export async function saveVoiceSource(id: string | null, owner: string, value: unknown) {
  const input = voiceInputSchema.parse(value), db = database();
  // A workspace library source survives deletion of its originating product.
  // Existing sources keep that immutable origin; creating a source still needs
  // an actual owned product and never accepts an arbitrary orphan origin.
  if (id) { const previous = await getVoiceSource(id, owner); if (previous.productId !== input.productId) throw new ApiError('A source cannot be moved to another product.', 409); }
  else await ownedProduct(input.productId, owner);
  if (input.uploadId) {
    const upload = await db.prepare("SELECT mime FROM uploads WHERE id=? AND owner=? AND product_id=? AND status='completed'").bind(input.uploadId, owner, input.productId).first();
    if (!upload || !/^(audio|video)\//.test(String(upload.mime))) throw new ApiError('Select one of your audio or video uploads.', 400);
    if ((input.kind === 'video' && !String(upload.mime).startsWith('video/')) || (input.kind === 'audio' && !String(upload.mime).startsWith('audio/'))) throw new ApiError('The recording type does not match this source.', 400);
  }
  const updatedAt = Math.max(Date.now(), input.expectedUpdatedAt + 1), sourceId = id || crypto.randomUUID();
  const args = [input.title, input.kind, input.transcript, input.evidence, input.uploadId, Number(input.permission), Number(input.approved), updatedAt];
  const uploadGuard=" AND (? IS NULL OR EXISTS(SELECT 1 FROM uploads WHERE id=? AND owner=? AND product_id=? AND status='completed'))";
  const uploadValues=[input.uploadId,input.uploadId,owner,input.productId];
  const result = id ? await db.prepare('UPDATE creator_voice_sources SET title=?,kind=?,transcript=?,evidence=?,upload_id=?,permission=?,approved=?,updated_at=?,lease=0,lease_id=NULL WHERE id=? AND owner=? AND updated_at=? AND lease<?'+uploadGuard).bind(...args, id, owner, input.expectedUpdatedAt, Date.now(),...uploadValues).run()
    : await db.prepare('INSERT INTO creator_voice_sources (title,kind,transcript,evidence,upload_id,permission,approved,updated_at,id,owner,product_id) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ?=0 AND (SELECT COUNT(*) FROM creator_voice_sources WHERE owner=?)<100 AND EXISTS(SELECT 1 FROM products WHERE id=? AND owner=?)'+uploadGuard).bind(...args, sourceId, owner, input.productId, input.expectedUpdatedAt, owner,input.productId,owner,...uploadValues).run();
  if (!result.meta.changes) throw new ApiError(id ? 'This source changed or AI is still transcribing. Reload it before saving.' : 'Your library is full (100 sources) or this draft is stale.', 409);
  return getVoiceSource(sourceId, owner);
}
export async function deleteVoiceSource(id: string, owner: string, revision: number) {
  await getVoiceSource(id, owner);
  const result = await database().prepare('DELETE FROM creator_voice_sources WHERE id=? AND owner=? AND updated_at=? AND lease<?').bind(id, owner, revision, Date.now()).run();
  if (!result.meta.changes) throw new ApiError('This source changed or AI is transcribing. Reload before deleting.', 409);
}
export async function creatorVoiceContext(owner: string, ids?: string[]): Promise<VoiceContext[]> {
  const available = (await listVoiceSources(owner)).filter(source => source.approved && source.permission && source.transcript.trim());
  const sources = ids ? ids.map(id => { const source = available.find(item => item.id === id); if (!source) throw new ApiError('A selected voice source was removed or is not approved for AI. Review your library.', 409); return source; }) : available.slice(0, 5);
  const excerptLimit = Math.min(6000, Math.floor(18000 / Math.max(1, sources.length)));
  return sources.map(source => { const transcript = source.transcript.slice(0, excerptLimit);
    return { id: source.id, title: source.title, updatedAt: source.updatedAt, kind: source.kind, transcript, evidence: source.evidence.slice(0, 1500) }; });
}
export async function assertVoiceRevisions(owner: string, references: VoiceReference[]) {
  for (const reference of references) {
    const row = await database().prepare('SELECT id FROM creator_voice_sources WHERE id=? AND owner=? AND updated_at=? AND approved=1 AND permission=1').bind(reference.id, owner, reference.updatedAt).first();
    if (!row) throw new ApiError('A referenced source was changed, removed, or unapproved. Refresh the draft and review its claims.', 409);
  }
}
export function voiceRevisionGuard(owner: string, references: VoiceReference[]) {
  return { sql: references.map(() => ' AND EXISTS(SELECT 1 FROM creator_voice_sources WHERE id=? AND owner=? AND updated_at=? AND approved=1 AND permission=1)').join(''), values: references.flatMap(source => [source.id, owner, source.updatedAt]) };
}
export async function transcribeVoiceSource(id: string, owner: string, value: unknown) {
  const source = await getVoiceSource(id, owner), input = creatorRunInput.extend({mode:z.enum(['append','replace']).default('append')}).parse(value);
  const previous = await previousCreatorRun('transcript', id, owner, input); if (previous) return previous;
  if (!source.permission) throw new ApiError('Confirm you have permission to process this recording before transcription.', 400);
  if (!source.uploadId) throw new ApiError('Attach an audio or video recording first.', 400);
  const upload = await database().prepare("SELECT * FROM uploads WHERE id=? AND owner=? AND product_id=? AND status='completed'").bind(source.uploadId, owner, source.productId).first();
  if (!upload) throw new ApiError('The recording is no longer available.', 404);
  if (Number(upload.size) > 25 * 1024 * 1024) throw new ApiError('AI transcription accepts recordings up to 25 MB. Upload a shorter clip or paste a transcript.', 413);
  const ai = await providerSettings(); if (!ai.connected.openai || ai.config.paused) throw new ApiError('OpenAI transcription is not configured. You can paste a transcript instead.', 503);
  const cost = await hasUnlimitedGeneration(owner) ? 0 : 10;
  return runCreatorAI('transcript', id, owner, input, cost, async () => {
    const bucket = (env as unknown as { BUCKET: R2Bucket }).BUCKET;
    const file = await bucket?.get(String(upload.object_key)); if (!file) throw new ApiError('Recording unavailable.', 404);
    const data = new FormData(); data.set('model', 'gpt-4o-mini-transcribe'); data.set('response_format', 'json');
    data.set('file', new File([await new Response(file.body).arrayBuffer()], String(upload.name), { type: String(upload.mime) }));
    await reserveAIBudget(1000000, owner);
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${await providerKey(owner, 'openai')}` }, body: data, signal: AbortSignal.timeout(150000) });
    if (!response.ok) throw new ApiError('Transcription is temporarily unavailable. Your recording is saved and this attempt was not charged.', 502);
    const result = await response.json() as { text?: unknown };
    if (typeof result.text !== 'string' || !result.text.trim() || result.text.length > 20000) throw new ApiError('The transcript is empty or too long. Try a shorter recording or paste a reviewed transcript.', 502);
    const transcript=input.mode==='append'&&source.transcript.trim()?source.transcript+'\n\n'+result.text:result.text;if(transcript.length>20000)throw new ApiError('The combined transcript exceeds 20,000 characters. Your original text is unchanged and this attempt was not charged. Save a shorter excerpt or choose replacement deliberately.',413);return { transcript };
  }, (result, updatedAt) => database().prepare('UPDATE creator_voice_sources SET transcript=?,approved=0,updated_at=?,lease=0 WHERE id=? AND owner=? AND updated_at=? AND lease_id=?')
    .bind(result.transcript, updatedAt, id, owner, input.expectedUpdatedAt, input.requestId));
}
