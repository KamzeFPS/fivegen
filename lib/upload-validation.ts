import { createHash } from 'node:crypto';

/** Structural file validation and integrity checks; this is not a malware scan. */
export class UploadValidationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const supportedMime = new Set([
  'video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/wav',
  'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/flac', 'application/pdf', 'image/jpeg',
  'image/png', 'image/webp', 'text/plain', 'text/csv',
]);

export function validateUploadMetadata(input: { name: string; mime: string; size: number; hasBody: boolean }, limit: number) {
  if (!supportedMime.has(input.mime))
    throw new UploadValidationError('Upload an MP4, WebM, audio recording, PDF, image, text or CSV file.');
  if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > limit || !input.hasBody)
    throw new UploadValidationError('Files must be between 1 byte and 100 MB.', 413);
  const pdfName = /\.pdf$/i.test(input.name);
  if (pdfName !== (input.mime === 'application/pdf'))
    throw new UploadValidationError('A PDF must have a .pdf filename and the application/pdf file type. Choose the original PDF file.');
}

export function createUploadValidator(size: number, mime: string) {
  const hash = createHash('sha256');
  let received = 0, complete = false, checksum = '';
  let header = new Uint8Array(0), tail = new Uint8Array(0);
  const pdf = mime === 'application/pdf';
  const stream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > size) throw new UploadValidationError('The file is larger than its declared size. Select it again and retry.', 413);
      hash.update(chunk);
      if (pdf) {
        if (header.length < 16) {
          const next = new Uint8Array(Math.min(16, header.length + chunk.length));
          next.set(header); next.set(chunk.subarray(0, next.length - header.length), header.length); header = next;
        }
        const next = new Uint8Array(Math.min(1024, tail.length + chunk.length));
        const kept = Math.min(tail.length, Math.max(0, next.length - chunk.length));
        next.set(tail.subarray(tail.length - kept));
        next.set(chunk.subarray(Math.max(0, chunk.length - (next.length - kept))), kept); tail = next;
      }
      controller.enqueue(chunk);
    },
    flush() {
      if (received !== size) throw new UploadValidationError('The upload was interrupted. Select the original file and retry.');
      if (pdf) {
        const decoder = new TextDecoder('latin1');
        if (!/^%PDF-(?:1\.[0-7]|2\.0)(?:\r\n?|\n)/.test(decoder.decode(header)))
          throw new UploadValidationError('This file does not have a valid PDF header. Export a PDF from its original application and retry.');
        if (!/%%EOF[\t\r\n\f \0]*$/.test(decoder.decode(tail)))
          throw new UploadValidationError('This PDF appears incomplete. Export the complete PDF and retry.');
      }
      checksum = hash.digest('hex'); complete = true;
    },
  });
  return {
    stream,
    checksum() {
      if (!complete) throw new UploadValidationError('The upload has not finished. Retry the file.', 409);
      return checksum;
    },
  };
}

export async function verifyStoredUpload(body: ReadableStream<Uint8Array>, size: number, expected: string) {
  const hash = createHash('sha256');
  let received = 0;
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > size) throw new UploadValidationError('The saved file could not be verified. Please upload it again.', 503);
      hash.update(value);
    }
    if (received !== size || hash.digest('hex') !== expected)
      throw new UploadValidationError('The saved file could not be verified. Please upload it again.', 503);
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
