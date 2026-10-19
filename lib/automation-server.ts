import { ApiError, binding, database, ownedProduct } from '@/lib/server';
import { providerKey, providerSettings } from '@/lib/ai';
import { automationDraftSchema, renderAutomationText, type AutomationDraft, type AutomationSequence, type AutomationWorkspace } from '@/lib/automation';

type Row = Record<string, unknown>;
type Snapshot = AutomationDraft & { from: string; origin: string; trigger: 'lead' | 'purchase'; name: string; product: string; funnel_url: string; portal_url: string };
const noStore = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
export const automationResponseHeaders = noStore;
function sequence(row: Row): AutomationSequence {
  return { id: String(row.id), trigger: row.trigger as 'lead' | 'purchase', status: row.status as AutomationSequence['status'], draft: automationDraftSchema.parse(JSON.parse(String(row.draft))), revision: Number(row.revision), approvedRevision: row.approved_revision == null ? null : Number(row.approved_revision), updatedAt: Number(row.updated_at), activatedAt: row.activated_at == null ? null : Number(row.activated_at) };
}
function origin() {
  try { const url = new URL(binding('APP_ORIGIN')); return (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) && !url.username && !url.password ? url.origin : ''; } catch { return ''; }
}
export async function automationReadiness() {
  const settings = await providerSettings(), sender = settings.config.emailFrom || binding('EMAIL_FROM');
  if (!settings.connected.resend || !sender) return { ready: false, message: 'An administrator must connect Resend and a verified EMAIL_FROM sender before you can activate email delivery.' };
  if (!/^[^<>\s]+@[^<>\s]+\.[^<>\s]+$/.test(sender)) return { ready: false, message: 'Set EMAIL_FROM to a verified email address without a display name. Each creator can supply their sender name below.' };
  if (!origin() || binding('AUTOMATION_DISPATCH_SECRET').length < 32) return { ready: false, message: 'An administrator must configure APP_ORIGIN and the email worker secret before email delivery can start.' };
  return { ready: true, message: 'Email delivery is configured. Review your copy and sender details before activating.' };
}
export async function getAutomationWorkspace(productId: string, owner: string): Promise<AutomationWorkspace> {
  await ownedProduct(productId, owner);
  const rows = await database().prepare('SELECT * FROM automation_sequences WHERE product_id=? AND owner=? ORDER BY trigger').bind(productId, owner).all();
  const logRows = await database().prepare(`SELECT j.*,e.email,e.snapshot FROM automation_jobs j JOIN automation_enrollments e ON e.id=j.enrollment_id WHERE j.product_id=? AND j.owner=? ORDER BY COALESCE(j.sent_at,j.first_attempt_at,j.due_at) DESC,j.id DESC LIMIT 60`).bind(productId, owner).all();
  const counts = await database().prepare('SELECT status,COUNT(*) AS count FROM automation_jobs WHERE product_id=? AND owner=? GROUP BY status').bind(productId, owner).all();
  return { sequences: rows.results.map(sequence), readiness: await automationReadiness(), counts: Object.fromEntries(counts.results.map(r => [String(r.status), Number(r.count)])), logs: logRows.results.map(r => ({ id: String(r.id), email: String(r.email), subject: (JSON.parse(String(r.snapshot)) as Snapshot).steps[Number(r.step_index)]?.subject || '', status: String(r.status), dueAt: Number(r.due_at), sentAt: r.sent_at == null ? null : Number(r.sent_at), attempts: Number(r.attempts), error: String(r.error) })) };
}
export async function saveAutomation(productId: string, owner: string, trigger: 'lead' | 'purchase', draftInput: unknown, expectedRevision: number) {
  await ownedProduct(productId, owner); const draft = automationDraftSchema.parse(draftInput);
  if (trigger === 'purchase' && draft.steps.some(s => s.kind !== 'onboarding')) throw new ApiError('Purchase emails must contain customer onboarding only. Keep promotional content in the consent-based lead sequence.');
  if (trigger === 'lead' && draft.steps.some(s => s.kind === 'onboarding')) throw new ApiError('Use the purchase sequence for customer onboarding.');
  const now = Date.now();
  const result = await database().prepare(`INSERT INTO automation_sequences (id,owner,product_id,trigger,status,draft,revision,updated_at)
    SELECT ?,?,?,?,'draft',?,1,? WHERE ?=0 OR EXISTS(SELECT 1 FROM automation_sequences WHERE product_id=? AND owner=? AND trigger=?)
    ON CONFLICT(product_id,trigger) DO UPDATE SET draft=excluded.draft,revision=automation_sequences.revision+1,updated_at=MAX(automation_sequences.updated_at+1,excluded.updated_at)
    WHERE automation_sequences.owner=excluded.owner AND automation_sequences.revision=?`)
    .bind(crypto.randomUUID(), owner, productId, trigger, JSON.stringify(draft), now, expectedRevision, productId, owner, trigger, expectedRevision).run();
  if (!result.meta.changes) throw new ApiError('This sequence changed in another tab. Refresh before saving.', 409);
  return getAutomationWorkspace(productId, owner);
}
export async function setAutomationStatus(productId: string, owner: string, trigger: 'lead' | 'purchase', action: 'activate' | 'pause', expectedRevision: number) {
  await ownedProduct(productId, owner);
  const row = await database().prepare('SELECT * FROM automation_sequences WHERE product_id=? AND owner=? AND trigger=?').bind(productId, owner, trigger).first();
  if (!row) throw new ApiError('Save a sequence first.', 404);
  if (Number(row.revision) !== expectedRevision) throw new ApiError('The sequence changed. Review the latest saved version before approval.', 409);
  const now = Date.now();
  if (action === 'activate') {
    const readiness = await automationReadiness(); if (!readiness.ready) throw new ApiError(readiness.message, 409);
    const draft = automationDraftSchema.parse(JSON.parse(String(row.draft)));
    if (!draft.replyTo) throw new ApiError('Add your reply-to email before activating.');
    if (trigger === 'lead' && !draft.postalAddress.trim()) throw new ApiError('Add your business mailing address for the marketing email footer.');
    const config = await providerSettings();
    const approved = { ...draft, from: config.config.emailFrom || binding('EMAIL_FROM'), origin: origin(), trigger };
    const result = await database().prepare(`UPDATE automation_sequences SET status='active',approved=?,approved_revision=revision,activated_at=COALESCE(activated_at,?),updated_at=MAX(updated_at+1,?) WHERE id=? AND owner=? AND revision=?`).bind(JSON.stringify(approved), now, now, row.id, owner, expectedRevision).run();
    if (!result.meta.changes) throw new ApiError('The sequence changed during approval. Review again.', 409);
  } else {
    await database().prepare("UPDATE automation_sequences SET status='paused',updated_at=MAX(updated_at+1,?) WHERE id=? AND owner=? AND revision=?").bind(now, row.id, owner, expectedRevision).run();
  }
  return getAutomationWorkspace(productId, owner);
}
async function suppressed(owner: string, email: string) {
  return !!await database().prepare('SELECT id FROM automation_suppressions WHERE owner=? AND email=?').bind(owner, email).first();
}
async function paid(productId: string, owner: string, email: string) {
  return !!await database().prepare("SELECT id FROM commerce_orders WHERE product_id=? AND owner=? AND email=? AND status='paid' AND mode='live'").bind(productId, owner, email).first();
}
async function enroll(row: Row, event: { eventId: string; email: string; name: string; leadId?: string; orderId?: string; createdAt: number }) {
  if (row.status !== 'active' || !row.approved || event.createdAt < Number(row.activated_at || 0)) return;
  const owner = String(row.owner), productId = String(row.product_id), trigger = row.trigger as 'lead' | 'purchase';
  if (trigger === 'lead' && (await suppressed(owner, event.email) || await paid(productId, owner, event.email))) return;
  const product = await database().prepare('SELECT title,slug FROM products WHERE id=? AND owner=?').bind(productId, owner).first(); if (!product) return;
  const id = crypto.randomUUID(), now = Date.now(), approved = JSON.parse(String(row.approved)) as Snapshot;
  const snapshot: Snapshot = { ...approved, name: event.name || 'there', product: String(product.title), funnel_url: `${approved.origin}/g/${String(product.slug)}`, portal_url: `${approved.origin}/customer` };
  let offset = 0;
  const statements = [database().prepare(`INSERT OR IGNORE INTO automation_enrollments (id,owner,product_id,sequence_id,event_id,email,lead_id,order_id,revision,snapshot,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM automation_sequences WHERE id=? AND status='active' AND approved_revision=?)`).bind(id, owner, productId, row.id, event.eventId, event.email, event.leadId || null, event.orderId || null, row.approved_revision, JSON.stringify(snapshot), now, row.id, row.approved_revision)];
  snapshot.steps.forEach((step, i) => { offset += Math.round(step.delayHours * 3600000); statements.push(database().prepare(`INSERT INTO automation_jobs (id,enrollment_id,owner,product_id,step_index,status,due_at,lease,attempts,error) SELECT ?,?,?,?,?,'pending',?,0,0,'' WHERE EXISTS(SELECT 1 FROM automation_enrollments WHERE id=?)`).bind(crypto.randomUUID(), id, owner, productId, i, now + offset, id)); });
  await database().batch(statements);
}
export async function enrollAutomationLead(productId: string, owner: string, email: string) {
  const lead = await database().prepare('SELECT * FROM growth_leads WHERE product_id=? AND owner=? AND email=? AND marketing=1 AND consent_at IS NOT NULL').bind(productId, owner, email.toLowerCase().trim()).first();
  if (!lead) return;
  const row = await database().prepare("SELECT * FROM automation_sequences WHERE product_id=? AND owner=? AND trigger='lead' AND status='active'").bind(productId, owner).first();
  if (row) await enroll(row, { eventId: String(lead.id), email: String(lead.email), name: String(lead.name), leadId: String(lead.id), createdAt: Number(lead.consent_at) });
}
// Called only after the commerce webhook persists an authenticated, verified order.
// The order is looked up again here, so caller-provided email/owner is never trusted.
export async function enrollAutomationPurchase(orderId: string) {
  const order = await database().prepare("SELECT * FROM commerce_orders WHERE id=? AND status='paid' AND mode='live'").bind(orderId).first();
  if (!order) return;
  const owner = String(order.owner), productId = String(order.product_id), email = String(order.email).toLowerCase();
  await database().prepare(`UPDATE automation_jobs SET status='cancelled',lease=0,error='Customer purchased this product.' WHERE owner=? AND product_id=? AND status IN ('pending','sending') AND enrollment_id IN (SELECT id FROM automation_enrollments WHERE owner=? AND email=? AND lead_id IS NOT NULL)`).bind(owner, productId, owner, email).run();
  const row = await database().prepare("SELECT * FROM automation_sequences WHERE product_id=? AND owner=? AND trigger='purchase' AND status='active'").bind(productId, owner).first();
  if (row) await enroll(row, { eventId: String(order.id), email, name: String(order.customer_name || 'there'), orderId: String(order.id), createdAt: Number(order.paid_at) });
}
async function hash(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join(''); }
async function unsubscribeToken(enrollmentId: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(binding('AUTOMATION_DISPATCH_SECRET')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('automation-unsubscribe:' + enrollmentId))), b => b.toString(16).padStart(2, '0')).join('');
}
export async function unsubscribeAutomation(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new ApiError('This unsubscribe link is unavailable.', 404);
  const row = await database().prepare('SELECT owner,email FROM automation_unsubscribe_tokens WHERE hash=?').bind(await hash(token)).first();
  if (!row) throw new ApiError('This unsubscribe link is unavailable.', 404);
  const now = Date.now();
  await database().batch([
    database().prepare('INSERT INTO automation_suppressions (id,owner,email,created_at) VALUES (?,?,?,?) ON CONFLICT(owner,email) DO NOTHING').bind(crypto.randomUUID(), row.owner, row.email, now),
    database().prepare('UPDATE growth_leads SET marketing=0,updated_at=MAX(updated_at+1,?) WHERE owner=? AND email=?').bind(now, row.owner, row.email),
    database().prepare("UPDATE automation_jobs SET status='cancelled',lease=0,error='Recipient unsubscribed.' WHERE status IN ('pending','sending') AND enrollment_id IN(SELECT id FROM automation_enrollments WHERE owner=? AND email=? AND lead_id IS NOT NULL)").bind(row.owner, row.email),
  ]);
}
async function canSend(row: Row): Promise<'send' | 'pause' | string> {
  const current = await database().prepare(`SELECT s.status FROM automation_sequences s JOIN products p ON p.id=s.product_id AND p.owner=s.owner WHERE s.id=? AND s.owner=?`).bind(row.sequence_id, row.owner).first();
  if (!current) return 'The product or sequence was removed.';
  if (current.status !== 'active') return 'pause';
  if (row.lead_id) {
    if (await suppressed(String(row.owner), String(row.email))) return 'Recipient unsubscribed.';
    const lead = await database().prepare('SELECT id FROM growth_leads WHERE id=? AND owner=? AND email=? AND marketing=1 AND consent_at IS NOT NULL').bind(row.lead_id, row.owner, row.email).first();
    if (!lead) return 'Marketing consent was revoked.';
    if (await paid(String(row.product_id), String(row.owner), String(row.email))) return 'Customer purchased this product.';
  } else {
    const order = await database().prepare("SELECT id FROM commerce_orders WHERE id=? AND owner=? AND product_id=? AND email=? AND status='paid' AND mode='live'").bind(row.order_id, row.owner, row.product_id, row.email).first();
    if (!order) return 'The purchase is no longer active.';
  }
  return 'send';
}
async function reconcileEnrollments() {
  // Durable catch-up if a signup/webhook was persisted just before a process restart.
  // Existing contacts are not silently bulk-enrolled when a sequence is activated.
  const leads = await database().prepare(`SELECT l.* FROM growth_leads l JOIN automation_sequences s ON s.product_id=l.product_id AND s.owner=l.owner AND s.trigger='lead' AND s.status='active' WHERE l.marketing=1 AND l.consent_at>=s.activated_at AND NOT EXISTS(SELECT 1 FROM automation_enrollments e WHERE e.sequence_id=s.id AND e.event_id=l.id) AND NOT EXISTS(SELECT 1 FROM automation_suppressions x WHERE x.owner=l.owner AND x.email=l.email) AND NOT EXISTS(SELECT 1 FROM commerce_orders o WHERE o.product_id=l.product_id AND o.owner=l.owner AND o.email=l.email AND o.status='paid' AND o.mode='live') ORDER BY l.consent_at LIMIT 100`).all();
  for (const lead of leads.results) await enrollAutomationLead(String(lead.product_id), String(lead.owner), String(lead.email));
  const orders = await database().prepare(`SELECT o.id FROM commerce_orders o JOIN automation_sequences s ON s.product_id=o.product_id AND s.owner=o.owner AND s.trigger='purchase' AND s.status='active' WHERE o.status='paid' AND o.mode='live' AND o.paid_at>=s.activated_at AND NOT EXISTS(SELECT 1 FROM automation_enrollments e WHERE e.sequence_id=s.id AND e.event_id=o.id) ORDER BY o.paid_at LIMIT 100`).all();
  for (const order of orders.results) await enrollAutomationPurchase(String(order.id));
}
export async function dispatchAutomations(limit = 20) {
  const readiness = await automationReadiness(); if (!readiness.ready) return { processed: 0, sent: 0, message: readiness.message };
  await reconcileEnrollments();
  const now = Date.now();
  const jobs = await database().prepare(`SELECT j.id FROM automation_jobs j JOIN automation_enrollments e ON e.id=j.enrollment_id JOIN automation_sequences s ON s.id=e.sequence_id WHERE j.due_at<=? AND (j.status='pending' OR (j.status='sending' AND j.lease<?)) AND s.status='active' AND NOT EXISTS(SELECT 1 FROM automation_jobs earlier WHERE earlier.enrollment_id=j.enrollment_id AND earlier.step_index<j.step_index AND earlier.status NOT IN ('sent','cancelled')) ORDER BY j.due_at,j.id LIMIT ?`).bind(now, now, Math.max(1, Math.min(50, limit))).all();
  let sent = 0, processed = 0;
  for (const candidate of jobs.results) {
    const lease = Date.now() + 60000;
    const claimed = await database().prepare("UPDATE automation_jobs SET status='sending',lease=? WHERE id=? AND (status='pending' OR (status='sending' AND lease<?))").bind(lease, candidate.id, Date.now()).run();
    if (!claimed.meta.changes) continue; processed++;
    const row = await database().prepare('SELECT j.*,e.email,e.sequence_id,e.lead_id,e.order_id,e.snapshot FROM automation_jobs j JOIN automation_enrollments e ON e.id=j.enrollment_id WHERE j.id=?').bind(candidate.id).first(); if (!row) continue;
    // Resend retains idempotency keys for 24 hours. Never retry ambiguous sends
    // outside that window, even if this worker was offline for several days.
    if (row.first_attempt_at != null && Date.now() - Number(row.first_attempt_at) >= 23 * 3600000) { await finishJob(row, 'failed', 'Delivery could not be confirmed within the safe retry window. Check Resend before contacting this recipient.'); continue; }
    try {
      const snapshot = JSON.parse(String(row.snapshot)) as Snapshot, step = snapshot.steps[Number(row.step_index)];
      if (!step) { await finishJob(row, 'failed', 'The approved email snapshot is unavailable.'); continue; }
      const key = await providerKey('', 'resend');
      const permission = await canSend(row);
      if (permission === 'pause') { await finishJob(row, 'pending', 'Sequence paused.'); continue; }
      if (permission !== 'send') { await finishJob(row, 'cancelled', permission); continue; }
      let footer = '', unsubscribeUrl = '';
      if (snapshot.trigger === 'lead') {
        const token = await unsubscribeToken(String(row.enrollment_id)), tokenHash = await hash(token);
        const existing = await database().prepare('SELECT hash FROM automation_unsubscribe_tokens WHERE enrollment_id=?').bind(row.enrollment_id).first();
        if (existing && existing.hash !== tokenHash) { await finishJob(row, 'failed', 'The worker signing key changed. Review delivery in Resend before retrying.'); continue; }
        await database().prepare('INSERT OR IGNORE INTO automation_unsubscribe_tokens (hash,owner,email,enrollment_id,created_at) VALUES (?,?,?,?,?)').bind(tokenHash, row.owner, row.email, row.enrollment_id, Date.now()).run();
        unsubscribeUrl = `${snapshot.origin}/unsubscribe#${token}`;
        footer = `\n\n—\n${snapshot.senderName}\n${snapshot.postalAddress}\nUnsubscribe from this creator: ${unsubscribeUrl}`;
      }
      // Recheck after token/key work, immediately before the external send.
      const live = await database().prepare("SELECT id FROM automation_jobs WHERE id=? AND status='sending' AND lease=?").bind(row.id, lease).first();
      const finalPermission = await canSend(row);
      if (!live) continue;
      if (finalPermission !== 'send') { await finishJob(row, finalPermission === 'pause' ? 'pending' : 'cancelled', finalPermission === 'pause' ? 'Sequence paused.' : finalPermission); continue; }
      const attempt = await database().prepare("UPDATE automation_jobs SET attempts=attempts+1,first_attempt_at=COALESCE(first_attempt_at,?) WHERE id=? AND lease=? AND status='sending'").bind(Date.now(), row.id, lease).run();
      if (!attempt.meta.changes) continue;
      row.attempts = Number(row.attempts) + 1;
      const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `fivegen-automation/${String(row.id)}` }, body: JSON.stringify({ from: `${snapshot.senderName} <${snapshot.from}>`, reply_to: snapshot.replyTo, to: [String(row.email)], subject: renderAutomationText(step.subject, snapshot), text: renderAutomationText(step.body, snapshot) + footer }), signal: AbortSignal.timeout(15000) });
      const responseBody = await response.json().catch(() => ({})) as { id?: string };
      if (response.ok && responseBody.id) {
        const deliveredAt = Date.now(), next = snapshot.steps[Number(row.step_index) + 1];
        // If the recipient unsubscribes while a request is already in flight,
        // record the provider's acceptance truthfully; remaining jobs stay cancelled.
        const accepted = [database().prepare("UPDATE automation_jobs SET status='sent',lease=0,sent_at=?,provider_id=?,error='' WHERE id=? AND status IN ('sending','cancelled')").bind(deliveredAt, responseBody.id, row.id)];
        if (next) accepted.push(database().prepare("UPDATE automation_jobs SET due_at=MAX(due_at,?) WHERE enrollment_id=? AND step_index=? AND status='pending'").bind(deliveredAt + Math.round(next.delayHours * 3600000), row.enrollment_id, Number(row.step_index) + 1));
        await database().batch(accepted);
        sent++;
      }
      else if (response.status === 429 || response.status >= 500 || response.status === 409) await retryJob(row, 'The email provider is temporarily unavailable. Delivery will retry automatically.');
      else await finishJob(row, 'failed', `Email provider rejected delivery (${response.status}). Check the verified sender and account configuration.`);
    } catch { await retryJob(row, 'Delivery could not be confirmed. A retry will use the same email identity.'); }
  }
  return { processed, sent };
}
async function finishJob(row: Row, status: string, error: string) {
  await database().prepare('UPDATE automation_jobs SET status=?,lease=0,error=? WHERE id=? AND lease=?').bind(status, error, row.id, row.lease).run();
}
async function retryJob(row: Row, message: string) {
  if (Number(row.attempts) >= 6) { await finishJob(row, 'failed', 'Delivery could not be confirmed after six attempts. Check Resend before contacting this recipient.'); return; }
  const delay = Math.min(3600000, 30000 * 2 ** Number(row.attempts));
  await database().prepare("UPDATE automation_jobs SET status='pending',lease=0,due_at=?,error=? WHERE id=? AND lease=?").bind(Date.now() + delay, message, row.id, row.lease).run();
}
