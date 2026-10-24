import {failure} from '@/lib/server';
import {customerUpload} from '@/lib/commerce-v2-server';
export async function GET(request:Request,{params}:{params:Promise<{id:string;uploadId:string}>}){try{const {id,uploadId}=await params;return await customerUpload(request,id,uploadId);}catch(error){return failure(error);}}
