import {ApiError,failure,identity,ownedProduct,sameOrigin} from '@/lib/server';
import {documentLimits,ProductDocumentError} from '@/lib/product-document-archive';
import {importProductDocument} from '@/lib/product-document-import';
import {documentOcrBusy} from '@/lib/product-document-ocr';

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    sameOrigin(req);const user=await identity(),{id}=await params;await ownedProduct(id,user.userId);
    let name:string;try{name=decodeURIComponent(req.headers.get('x-file-name')||'').split(/[\\/]/).at(-1)||'';}catch{throw new ApiError('Choose a manuscript with a valid filename.');}
    if(!/\.(docx|pdf|epub)$/i.test(name))throw new ApiError('Choose a DOCX, PDF, or EPUB manuscript.');
    const language=req.headers.get('x-ocr-language');
    if(language&&(!['eng','mon','rus'].includes(language)||!/\.pdf$/i.test(name)))throw new ApiError('Scanned recognition supports PDF in English, Mongolian or Russian.');
    if(language&&documentOcrBusy())throw new ApiError('Document recognition is busy. Try again after the current import finishes.',429);
    const declared=Number(req.headers.get('content-length')||req.headers.get('x-file-size')||0);
    if(declared>documentLimits.input)throw new ApiError('Manuscript imports support files up to 20 MB.',413);
    if(!req.body)throw new ApiError('The manuscript upload is empty.');
    const reader=req.body.getReader(),chunks:Uint8Array[]=[];let size=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>documentLimits.input)throw new ApiError('Manuscript imports support files up to 20 MB.',413);chunks.push(value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    if(language){
      const abort=new AbortController(),encoder=new TextEncoder();let cancelled=false,lastProgress=0;
      const cancel=()=>{cancelled=true;abort.abort();};req.signal.addEventListener('abort',cancel,{once:true});if(req.signal.aborted)cancel();
      return new Response(new ReadableStream<Uint8Array>({
        async start(controller){
          const send=(value:unknown)=>{if(!cancelled)controller.enqueue(encoder.encode(JSON.stringify(value)+'\n'));};
          try{send({type:'progress',status:'Preparing local scanned PDF recognition',page:0,progress:0});const preview=await importProductDocument(bytes,name,{ocrLanguage:language as 'eng'|'mon'|'rus',signal:abort.signal,onProgress:progress=>{if(progress.progress===1||Date.now()-lastProgress>150){lastProgress=Date.now();send({type:'progress',...progress});}}});send({type:'preview',preview});}
          catch(error){send({type:'error',error:error instanceof ProductDocumentError?error.message:'This scan could not be recognized. Try a clearer or smaller PDF.',status:error instanceof ProductDocumentError?error.status:500});}
          finally{req.signal.removeEventListener('abort',cancel);if(!cancelled)controller.close();}
        },cancel,
      }),{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    const preview=await importProductDocument(bytes,name);
    // Parsing is a preview only. Nothing is uploaded, saved or published until
    // the creator reviews and explicitly applies the returned draft sections.
    return Response.json({preview},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){return failure(error instanceof ProductDocumentError?new ApiError(error.message,error.status):error);}
}
