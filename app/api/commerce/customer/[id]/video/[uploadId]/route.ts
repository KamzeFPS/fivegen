import { failure } from '@/lib/server';
import { customerVideo } from '@/lib/commerce-v2-server';
export async function GET(req:Request,{params}:{params:Promise<{id:string;uploadId:string}>}){try{const {id,uploadId}=await params;return await customerVideo(req,id,uploadId);}catch(error){return failure(error);}}
