import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {z} from 'zod';
import {ApiError} from './server';
import {providerKey,providerSettings} from './ai';
import {reserveAIBudget} from './credits';
import {DESIGN_IMAGE_MODEL,designImageQualitySchema,designImageSizes,type DesignImageQuality,type DesignImageBackground} from './design-image';

export const openAIImageSizes=[...designImageSizes,'1536x864','864x1536'] as const;
export type OpenAIImageSize=typeof openAIImageSizes[number];
export type OpenAIImageOptions={owner:string;prompt:string;quality:DesignImageQuality;size:OpenAIImageSize;background:DesignImageBackground;outputFormat:'png'|'jpeg'};
export type GeneratedOpenAIImage={bytes:Uint8Array;mime:'image/png'|'image/jpeg';width:number;height:number};
const optionsSchema=z.object({owner:z.string().min(1),prompt:z.string().trim().min(1).max(6000),quality:designImageQualitySchema,size:z.enum(openAIImageSizes),background:z.enum(['transparent','opaque']),outputFormat:z.enum(['png','jpeg'])}).strict().refine(value=>value.outputFormat==='png'||value.background==='opaque','Transparent artwork must use PNG.');
const maximumImageBytes=8_000_000,maximumResponseBytes=12_000_000;

/** Safe capability metadata only; the existing platform key stays server-side. */
export async function imageGenerationReadiness(owner:string){
 const ai=await providerSettings(owner),enabled=Boolean(!ai.config.paused&&ai.connected.openai);
 return {enabled,ready:enabled,model:DESIGN_IMAGE_MODEL,message:enabled?'GPT Image 2 is available. Generated artwork remains a raster image layer.':ai.config.paused?'Image generation is temporarily paused. Templates and manual editing still work.':'OpenAI image generation is not connected. Templates and manual editing still work.'};
}
async function responseJson(response:Response){
 const declared=Number(response.headers.get('content-length'));if(declared>maximumResponseBytes)throw new ApiError('The image service returned an oversized response.',502);
 if(!response.body)throw new ApiError('The image service returned no image.',502);
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>maximumResponseBytes)throw new ApiError('The image service returned an oversized response.',502);chunks.push(value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as {data?:{b64_json?:unknown;url?:unknown}[];error?:{code?:unknown};output_format?:unknown;background?:unknown};}catch{throw new ApiError('The image service returned an unreadable response.',502);}
}
function dimensions(bytes:Uint8Array,format:'png'|'jpeg'){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(format==='png'){
  if(bytes.length<33||![137,80,78,71,13,10,26,10].every((part,index)=>bytes[index]===part)||Buffer.from(bytes.subarray(12,16)).toString()!=='IHDR')throw new ApiError('The image service returned an invalid PNG.',502);
  return {width:view.getUint32(16),height:view.getUint32(20)};
 }
 if(bytes.length<12||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)throw new ApiError('The image service returned an invalid JPEG.',502);
 let offset=2;
 while(offset+4<=bytes.length){
  if(bytes[offset++]!==255)break;while(offset<bytes.length&&bytes[offset]===255)offset++;
  const marker=bytes[offset++];if(marker===217||marker===218)break;if(marker===1||(marker>=208&&marker<=215))continue;
  if(offset+2>bytes.length)break;const length=view.getUint16(offset);if(length<2||offset+length>bytes.length)break;
  if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=8)return {width:view.getUint16(offset+5),height:view.getUint16(offset+3)};
  offset+=length;
 }
 throw new ApiError('The image service returned an invalid JPEG.',502);
}

/** One fixed provider request; callers own durable leases, credit charging and publication. */
export async function generateOpenAIImage(input:OpenAIImageOptions):Promise<GeneratedOpenAIImage>{
 const options=optionsSchema.parse(input),readiness=await imageGenerationReadiness(options.owner);
 if(!readiness.ready)throw new ApiError(readiness.message,503);
 const key=await providerKey(options.owner,'openai');
 // A conservative capacity reservation includes text input and failed requests.
 await reserveAIBudget(({low:20_000,medium:90_000,high:300_000})[options.quality]+new TextEncoder().encode(options.prompt).length*5,options.owner);
 let response:Response;
 try{response=await fetch('https://api.openai.com/v1/images/generations',{method:'POST',redirect:'error',signal:AbortSignal.timeout(150000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:DESIGN_IMAGE_MODEL,prompt:options.prompt,n:1,quality:options.quality,size:options.size,background:options.background,output_format:options.outputFormat,safety_identifier:createHash('sha256').update(options.owner).digest('hex')})});}
 catch{throw new ApiError('GPT Image 2 could not finish this request. Try again shortly.',504);}
 const payload=await responseJson(response);
 if(!response.ok){
  if(payload.error?.code==='content_policy_violation'||payload.error?.code==='moderation_blocked')throw new ApiError('The image service could not create this prompt. Revise your artwork description.',400);
  throw new ApiError(response.status===429?'The image service is busy. Try again shortly.':'GPT Image 2 is unavailable for this request. Check the connection or try an opaque background.',response.status===429?429:503);
 }
 if(!Array.isArray(payload.data)||payload.data.length!==1||typeof payload.data[0]?.b64_json!=='string')throw new ApiError('The image service returned no usable image bytes.',502);
 if(payload.output_format!==undefined&&payload.output_format!==options.outputFormat)throw new ApiError('The image service returned an unexpected file format.',502);
 if(payload.background!==undefined&&payload.background!==options.background)throw new ApiError('The image service did not produce the requested background. Try an opaque background.',502);
 const encoded=payload.data[0].b64_json;
 if(!encoded||encoded.length>Math.ceil(maximumImageBytes/3)*4||encoded.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))throw new ApiError('The image service returned invalid or oversized image data.',502);
 const original=Buffer.from(encoded,'base64');if(original.length>maximumImageBytes||original.toString('base64')!==encoded)throw new ApiError('The image service returned invalid or oversized image data.',502);
 const expected=options.size.split('x').map(Number),size=dimensions(original,options.outputFormat);
 if(size.width!==expected[0]||size.height!==expected[1]||size.width*size.height>2_400_000)throw new ApiError('The image service returned unexpected image dimensions.',502);
 try{
  const packageName='@napi-rs/canvas',native=createRequire(import.meta.url)(packageName) as {loadImage:(bytes:Uint8Array)=>Promise<{width:number;height:number}>;createCanvas:(width:number,height:number)=>{getContext:(kind:string)=>{drawImage:(image:unknown,x:number,y:number)=>void};toBuffer:(mime:'image/png'|'image/jpeg',quality?:number)=>Uint8Array}};
  const image=await native.loadImage(original);if(image.width!==size.width||image.height!==size.height)throw new Error('dimensions');
  const canvas=native.createCanvas(size.width,size.height);canvas.getContext('2d').drawImage(image,0,0);
  const mime=options.outputFormat==='png'?'image/png':'image/jpeg',bytes=new Uint8Array(options.outputFormat==='png'?canvas.toBuffer('image/png'):canvas.toBuffer('image/jpeg',92));
  if(!bytes.length||bytes.length>maximumImageBytes)throw new Error('size');
  return {bytes,mime,...size};
 }catch{throw new ApiError('The generated image could not be decoded safely. Please retry.',502);}
}
