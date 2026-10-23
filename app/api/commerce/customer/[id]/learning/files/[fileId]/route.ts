import {failure} from '@/lib/server';
import {downloadStudentFile} from '@/lib/product-learning-server';
export async function GET(req:Request,{params}:{params:Promise<{id:string;fileId:string}>}){try{const {id,fileId}=await params;return await downloadStudentFile(req,id,fileId);}catch(error){return failure(error);}}
