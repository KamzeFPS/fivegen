import {ApiError,failure,sameOrigin} from '@/lib/server';
import {submitServiceApplication} from '@/lib/service-applications-server';
export async function POST(req:Request,{params}:{params:Promise<{pageId:string}>}){try{sameOrigin(req);const {pageId}=await params,input=await req.json() as Record<string,unknown>;if(input.pageId!==pageId)throw new ApiError('Application page mismatch.',400);return Response.json(await submitServiceApplication(input),{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});}catch(error){return failure(error);}}
