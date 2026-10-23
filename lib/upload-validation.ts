import { createHash } from 'node:crypto';
import {readProductArchive} from './product-document-archive';

/** Structural file validation and integrity checks; this is not a malware scan. */
export class UploadValidationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const supportedMime = new Set([
  'video/mp4', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/wav',
  'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/flac', 'application/pdf', 'image/jpeg',
  'image/png', 'image/webp', 'text/plain', 'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/epub+zip','application/zip','application/x-zip-compressed',
  'application/octet-stream','application/json','text/javascript','application/javascript',
  'text/css','text/html','text/x-python','application/xml','text/xml','text/yaml','application/yaml',
]);

export function validateUploadMetadata(input: { name: string; mime: string; size: number; hasBody: boolean }, limit: number) {
  if (!supportedMime.has(input.mime))
    throw new UploadValidationError('Choose a supported document, spreadsheet, ZIP, code resource, image, audio, or video file.');
  if (!Number.isSafeInteger(input.size) || input.size < 1 || input.size > limit || !input.hasBody)
    throw new UploadValidationError('Files must be between 1 byte and 100 MB.', 413);
  const pdfName = /\.pdf$/i.test(input.name);
  if (pdfName !== (input.mime === 'application/pdf'))
    throw new UploadValidationError('A PDF must have a .pdf filename and the application/pdf file type. Choose the original PDF file.');
  const documentMimes:Record<string,string[]>={docx:['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],xlsx:['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],epub:['application/epub+zip'],zip:['application/zip','application/x-zip-compressed']};
  const extension=input.name.split('.').at(-1)?.toLowerCase()||'';
  if(documentMimes[extension]&&!documentMimes[extension].includes(input.mime))throw new UploadValidationError('The document file type does not match its extension. Export the original file again.');
  if(Object.entries(documentMimes).some(([ext,mimes])=>mimes.includes(input.mime)&&ext!==extension))throw new UploadValidationError('The file extension does not match its document format.');
  if(input.mime==='application/octet-stream'&&!/\.(?:txt|md|csv|json|js|jsx|ts|tsx|css|py|html|sql|yaml|yml|xml|fig|sketch)$/i.test(input.name))throw new UploadValidationError('Unknown binary files are not supported. Choose a recognized document or resource format.');
  if(/\.(?:exe|dll|com|scr|msi|bat|cmd|ps1|vbs|jar|svg)$/i.test(input.name))throw new UploadValidationError('Executable and active vector files are not supported.');
}

export function createUploadValidator(size: number, mime: string) {
  const hash = createHash('sha256');
  let received = 0, complete = false, checksum = '';
  let header = new Uint8Array(0), tail = new Uint8Array(0);
  const pdf = mime === 'application/pdf';
  const archiveKind=mime==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'?'docx':mime==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'?'xlsx':mime==='application/epub+zip'?'epub':['application/zip','application/x-zip-compressed'].includes(mime)?'zip':null;
  const archiveChunks:Uint8Array[]=[];
  const stream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      if (received > size) throw new UploadValidationError('The file is larger than its declared size. Select it again and retry.', 413);
      hash.update(chunk);
      if(archiveKind)archiveChunks.push(chunk.slice());
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
      if(archiveKind){const bytes=new Uint8Array(size);let offset=0;for(const chunk of archiveChunks){bytes.set(chunk,offset);offset+=chunk.length;}try{readProductArchive(bytes,archiveKind);}catch(error){throw new UploadValidationError(error instanceof Error?error.message:'The document archive could not be validated.');}}
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
