import {failure,identity,sameOrigin} from '@/lib/server';
import {readCreatorContextJson} from '@/lib/creator-context-request';
import {generateBuilderDesign} from '@/lib/builder-design-server';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  sameOrigin(request);const user=await identity(),{id}=await params;
  return Response.json(await generateBuilderDesign(id,user.userId,await readCreatorContextJson(request,24576)),{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
 }catch(error){const response=failure(error);response.headers.set('Cache-Control','private, no-store');response.headers.set('Referrer-Policy','no-referrer');return response;}
}
