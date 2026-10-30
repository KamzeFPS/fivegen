import {ApiError,failure,identity,sameOrigin} from '@/lib/server';
import {getWorkspaceDomains,saveWorkspaceDomains,manageWorkspaceCustomDomain} from '@/lib/workspace-domains-server';
const headers={'Cache-Control':'private, no-store'};
async function body(request:Request){
 if(Number(request.headers.get('content-length')||0)>32_768)throw new ApiError('Domain settings are too large.',413);
 const reader=request.body?.getReader();if(!reader)throw new ApiError('Enter valid domain settings.');
 const parts:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32_768){await reader.cancel();throw new ApiError('Domain settings are too large.',413);}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new ApiError('Enter valid domain settings.');}
}
export async function GET(){try{const user=await identity();return Response.json(await getWorkspaceDomains(user.userId),{headers});}catch(error){return failure(error);}}
export async function PATCH(request:Request){try{sameOrigin(request);const user=await identity();return Response.json(await saveWorkspaceDomains(user.userId,await body(request)),{headers});}catch(error){return failure(error);}}
export async function POST(request:Request){try{sameOrigin(request);const user=await identity();return Response.json(await manageWorkspaceCustomDomain(user.userId,await body(request)),{headers});}catch(error){return failure(error);}}
