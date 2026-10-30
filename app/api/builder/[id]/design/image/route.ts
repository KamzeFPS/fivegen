import {failure,identity,sameOrigin} from '@/lib/server';
import {readCreatorContextJson} from '@/lib/creator-context-request';
import {DesignImageError,designImageReadiness,generateDesignImage} from '@/lib/design-image-server';

const privateHeaders={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 try{const user=await identity(),{id}=await params;return Response.json(await designImageReadiness(id,user.userId),{headers:privateHeaders});}
 catch(error){const response=failure(error);for(const [key,value] of Object.entries(privateHeaders))response.headers.set(key,value);return response;}
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{sameOrigin(request);const user=await identity(),{id}=await params;return Response.json(await generateDesignImage(id,user.userId,await readCreatorContextJson(request,24576)),{headers:privateHeaders});}
 catch(error){
  if(error instanceof DesignImageError)return Response.json({error:error.message,retryable:error.retryable,reservedCreditsRefunded:error.reservedCreditsRefunded},{status:error.status,headers:privateHeaders});
  const response=failure(error);for(const [key,value] of Object.entries(privateHeaders))response.headers.set(key,value);return response;
 }
}
