import {failure} from '@/lib/server';
import {learningCertificate} from '@/lib/product-learning-server';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{return await learningCertificate(req,(await params).id);}catch(error){return failure(error);}}
