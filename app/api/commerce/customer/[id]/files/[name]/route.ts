import { failure } from '@/lib/server';
import { customerFile } from '@/lib/commerce-v2-server';
export async function GET(req:Request,{params}:{params:Promise<{id:string;name:string}>}){try{const {id,name}=await params;return await customerFile(req,id,name);}catch(error){return failure(error);}}
