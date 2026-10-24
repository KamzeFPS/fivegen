import {createRequire} from 'node:module';
import type {Worker as OcrWorker} from 'tesseract.js';
import type {PDFPageProxy} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {ProductDocumentError} from './product-document-archive';

export const ocrLimits={pages:10,pixels:4_000_000,runtimeMs:90_000,pageMs:25_000};
export type OcrProgress={page:number;status:string;progress:number};
export type OcrLanguage='eng'|'mon'|'rus';
let active=0;
export function documentOcrBusy(){return active>=1;}
export async function createDocumentOcr(language:OcrLanguage,signal?:AbortSignal,onProgress?:(progress:OcrProgress)=>void){
 if(!['eng','mon','rus'].includes(language))throw new ProductDocumentError('Choose English, Mongolian or Russian for scanned PDF recognition.');
 if(documentOcrBusy())throw new ProductDocumentError('Document recognition is busy. Try again after the current import finishes.',429);
 if(signal?.aborted)throw new ProductDocumentError('Document recognition was cancelled.',499);
 active++;let worker:OcrWorker|undefined,initializing:Promise<OcrWorker>|undefined,closing:Promise<void>|undefined,closed=false,pageNumber=0,processed=0,timeout:ReturnType<typeof setTimeout>|undefined;
 const failures=new Set<(error:Error)=>void>();
 const abort=()=>{const error=new ProductDocumentError('Document recognition was cancelled or exceeded its 90-second limit. Import fewer scanned pages and retry.',signal?.aborted?499:408);for(const reject of failures)reject(error);void close().catch(()=>{});};
 function close(){if(closing)return closing;closed=true;clearTimeout(timeout);signal?.removeEventListener('abort',abort);closing=(async()=>{try{const current=worker||await initializing?.catch(()=>undefined);if(current)await current.terminate();}finally{active--;}})();return closing;}
 async function bounded<T>(operation:Promise<T>,milliseconds:number){let timer:ReturnType<typeof setTimeout>|undefined;let rejectOperation:(error:Error)=>void=()=>{};try{return await Promise.race([operation,new Promise<T>((_,reject)=>{rejectOperation=reject;failures.add(reject);timer=setTimeout(()=>{reject(new ProductDocumentError('A scanned page took too long to recognize. Import a smaller or clearer scan.',408));void close().catch(()=>{});},milliseconds);})]);}finally{clearTimeout(timer);failures.delete(rejectOperation);}}
 try{
  // Optional Node modules stay outside the Worker bundle. Workers receive a
  // clear unsupported-runtime message; Render uses local WASM and language data.
  const loadNative=createRequire(import.meta.url),canvasPackage=['@napi-rs','canvas'].join('/'),ocrPackage=['tesseract','.js'].join(''),dataPackage=['@tesseract.js-data',language].join('/');
  const canvas=loadNative(canvasPackage) as typeof import('@napi-rs/canvas'),ocr=loadNative(ocrPackage) as typeof import('tesseract.js'),data=loadNative(dataPackage) as {langPath:string;gzip:boolean};
  const globals=globalThis as unknown as Record<string,unknown>;globals.DOMMatrix||=canvas.DOMMatrix;globals.Path2D||=canvas.Path2D;globals.ImageData||=canvas.ImageData;
  signal?.addEventListener('abort',abort,{once:true});timeout=setTimeout(abort,ocrLimits.runtimeMs);
  initializing=Promise.resolve().then(()=>{if(closed)throw new ProductDocumentError('Document recognition was cancelled.',499);return ocr.createWorker(language,1,{langPath:data.langPath,gzip:data.gzip,cacheMethod:'none',logger:message=>onProgress?.({page:pageNumber,status:message.status,progress:Number(message.progress)||0})});}).then(value=>{worker=value;return value;});
  worker=await bounded(initializing,20_000);if(closed)throw new ProductDocumentError('Document recognition was cancelled.',499);
  await worker.setParameters({preserve_interword_spaces:'1'});
  return {
   async recognize(page:PDFPageProxy,pageIndex:number){
    if(closed||signal?.aborted)throw new ProductDocumentError('Document recognition was cancelled.',499);
    if(++processed>ocrLimits.pages)throw new ProductDocumentError('OCR supports at most 10 scanned pages per import. Split this PDF into smaller files.',413);
    pageNumber=pageIndex;onProgress?.({page:pageIndex,status:'Rendering scanned page',progress:0});
    if(closed||signal?.aborted)throw new ProductDocumentError('Document recognition was cancelled.',499);
    const original=page.getViewport({scale:1}),scale=Math.min(2,Math.sqrt((ocrLimits.pixels-8192)/(original.width*original.height)),4096/original.width,4096/original.height),viewport=page.getViewport({scale});
    if(!Number.isFinite(viewport.width)||!Number.isFinite(viewport.height)||viewport.width<=0||viewport.height<=0)throw new ProductDocumentError('The scanned page has invalid dimensions.');
    if(Math.ceil(viewport.width)*Math.ceil(viewport.height)>ocrLimits.pixels)throw new ProductDocumentError('The scanned page exceeds the supported image dimensions.',413);
    const image=canvas.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height)),render=page.render({canvas:image as unknown as HTMLCanvasElement,canvasContext:image.getContext('2d') as unknown as CanvasRenderingContext2D,viewport});
    const cancel=()=>render.cancel();signal?.addEventListener('abort',cancel,{once:true});
    try{await bounded(render.promise,ocrLimits.pageMs);const result=await bounded(worker!.recognize(image.toBuffer('image/png')),ocrLimits.pageMs);onProgress?.({page:pageIndex,status:'Scanned page recognized',progress:1});return {text:result.data.text.trim(),confidence:result.data.confidence};}finally{render.cancel();signal?.removeEventListener('abort',cancel);image.width=1;image.height=1;}
   },close,
  };
 }catch(error){const cleanup=close();if(worker||!initializing)await cleanup;else void cleanup.catch(()=>{});if(error instanceof ProductDocumentError)throw error;throw new ProductDocumentError('Local scanned-PDF recognition is unavailable on this server. Use the Render document runtime with its bundled OCR languages, or import a text-based PDF/DOCX/EPUB.',503);}
}
