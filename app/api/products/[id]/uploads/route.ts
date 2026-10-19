import { env } from 'cloudflare:workers';
import { ApiError, database, failure, identity, ownedProduct, sameOrigin } from '@/lib/server';
import { storageLimit, uploadLimit } from '@/lib/experience';
import { createUploadValidator, UploadValidationError, validateUploadMetadata, verifyStoredUpload } from '@/lib/upload-validation';

async function recordUploadEvent(productId: string, owner: string, uploadId: string, event: 'upload_started' | 'upload_completed' | 'upload_failed') {
  try {
    // Telemetry is deliberately separate from delivery success. An unavailable
    // analytics write must never remove or fail an already verified file.
    await database().prepare('INSERT OR IGNORE INTO file_sale_events (id,product_id,owner,event,detail,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM file_sale_drafts WHERE product_id=?)')
      .bind(`${event}:${uploadId}`, productId, owner, event, '{"stage":"product","mode":"upload"}', Date.now(), productId).run();
  } catch { /* Best effort; do not log filenames, bodies, keys or raw errors. */ }
}

async function expireInterruptedAttempts(productId: string, owner: string) {
  // A crashed request cannot leave the draft waiting forever. The guarded
  // transitions below prevent a late writer from reviving an expired attempt.
  await database().prepare("UPDATE uploads SET status='failed',validation_error=?,updated_at=? WHERE product_id=? AND owner=? AND status IN ('uploading','processing') AND MAX(updated_at,created_at)<?")
    .bind('This upload did not finish within 30 minutes. Select the original file and retry.', Date.now(), productId, owner, Date.now() - 30 * 60 * 1000).run();
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await identity(), { id } = await params;
    await ownedProduct(id, user.userId);
    await expireInterruptedAttempts(id, user.userId);
    const rows = await database().prepare('SELECT id,name,mime,size,status,sha256,validation_error,created_at,updated_at FROM uploads WHERE product_id=? AND owner=? ORDER BY created_at DESC').bind(id, user.userId).all();
    return Response.json({ uploads: rows.results }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return failure(error); }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let uploadId = '', key = '', productId = '', owner = '';
  const bucket = (env as unknown as { BUCKET?: R2Bucket }).BUCKET;
  try {
    sameOrigin(req);
    const user = await identity(), { id } = await params;
    await ownedProduct(id, user.userId);
    productId = id; owner = user.userId;
    const mime = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const size = Number(req.headers.get('x-file-size'));
    // Keep a display filename, never a filesystem path or an object-storage key.
    const cleanName = (new URL(req.url).searchParams.get('name') || 'Upload').split(/[\\/]/).pop()!.replace(/[\x00-\x1f\x7f]/g, '') || 'Upload';
    const extension = cleanName.match(/\.[a-z0-9]{1,12}$/i)?.[0] || '';
    const name = cleanName.length > 150 ? cleanName.slice(0, 150 - extension.length) + extension : cleanName;
    validateUploadMetadata({ mime, size, name, hasBody: !!req.body }, uploadLimit);
    if (!bucket) throw new ApiError('File storage is unavailable. Please try again later.', 503);
    await expireInterruptedAttempts(id, user.userId);

    uploadId = crypto.randomUUID(); key = `classes/${user.userId}/${id}/${uploadId}`;
    const now = Date.now();
    const reserve = await database().prepare("INSERT INTO uploads (id,owner,product_id,name,mime,size,object_key,status,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT COALESCE(SUM(size),0) FROM uploads WHERE owner=? AND status!='failed') + ? <= ?")
      .bind(uploadId, user.userId, id, name, mime, size, key, 'uploading', now, now, user.userId, size, storageLimit).run();
    if (!reserve.meta.changes) { uploadId = ''; key = ''; throw new ApiError('Your 2 GB upload allowance is full. Remove unused files to make space.', 403); }
    await recordUploadEvent(id, user.userId, uploadId, 'upload_started');

    const validation = createUploadValidator(size, mime);
    const stream = req.body!.pipeThrough(validation.stream);
    if (typeof FixedLengthStream !== 'undefined') {
      const fixed = new FixedLengthStream(size);
      await Promise.all([stream.pipeTo(fixed.writable), bucket.put(key, fixed.readable, { httpMetadata: { contentType: mime } })]);
    } else {
      await bucket.put(key, stream, { httpMetadata: { contentType: mime } });
    }

    const checksum = validation.checksum();
    const processing = await database().prepare("UPDATE uploads SET status='processing',updated_at=? WHERE id=? AND status='uploading'").bind(Date.now(), uploadId).run();
    if (!processing.meta.changes) throw new UploadValidationError('This upload expired or was stopped. Select the original file and retry.', 409);
    const stored = await bucket.get(key);
    if (!stored || stored.size !== size) throw new UploadValidationError('The saved file could not be verified. Please upload it again.', 503);
    await verifyStoredUpload(stored.body, size, checksum);
    const completed = await database().prepare("UPDATE uploads SET status='completed',sha256=?,validation_error=NULL,updated_at=? WHERE id=? AND status='processing'").bind(checksum, Date.now(), uploadId).run();
    if (!completed.meta.changes) throw new UploadValidationError('This upload expired or was stopped. Select the original file and retry.', 409);
    await recordUploadEvent(id, user.userId, uploadId, 'upload_completed');
    return Response.json({ upload: { id: uploadId, name, mime, size, status: 'completed', sha256: checksum } }, { status: 201 });
  } catch (error) {
    const known = error instanceof ApiError || error instanceof UploadValidationError;
    const safe = new ApiError(known ? error.message : 'The upload could not be stored. Your other files are safe. Select the original file and retry.', known ? error.status : 503);
    if (uploadId) {
      // Only this unsuccessful request's object is discarded. Keep its lifecycle
      // record and every earlier uploaded file, revision and purchased resource.
      if (key) await bucket?.delete(key).catch(() => {});
      await database().prepare("UPDATE uploads SET status='failed',validation_error=?,updated_at=? WHERE id=? AND status IN ('uploading','processing')").bind(safe.message, Date.now(), uploadId).run();
      await recordUploadEvent(productId, owner, uploadId, 'upload_failed');
    }
    return failure(safe);
  }
}
