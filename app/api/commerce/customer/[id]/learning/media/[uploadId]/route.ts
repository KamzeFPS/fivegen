import {failure} from '@/lib/server';
import {learnerMedia} from '@/lib/product-learning-server';
export async function GET(req:Request,{params}:{params:Promise<{id:string;uploadId:string}>}){try{const {id,uploadId}=await params;return await learnerMedia(req,id,uploadId);}catch(error){return failure(error);}}
