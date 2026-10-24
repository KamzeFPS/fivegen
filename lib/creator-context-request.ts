import {ApiError} from './server';
/** Enforce bytes while streaming, before JSON decoding or schema validation. */
export async function readCreatorContextJson(req:Request,maxBytes=65536):Promise<unknown>{
 const length=req.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>maxBytes))throw new ApiError('Creator context request is too large. Shorten the profile or source choices.',413);
 if(!req.body)throw new ApiError('Send your creator context as JSON.',400);const reader=req.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let bytes=0,text='';
 try{for(;;){if(req.signal?.aborted)throw new ApiError('Context request cancelled.',499);const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>maxBytes)throw new ApiError('Creator context request is too large. Shorten the profile or source choices.',413);text+=decoder.decode(next.value,{stream:true});}text+=decoder.decode();try{return JSON.parse(text);}catch{throw new ApiError('Send valid JSON for your creator context.',400);}}
 catch(error){await reader.cancel().catch(()=>{});if(error instanceof ApiError)throw error;throw new ApiError(req.signal?.aborted?'Context request cancelled.':'Send valid UTF-8 JSON for your creator context.',req.signal?.aborted?499:400);}finally{reader.releaseLock();}
}
