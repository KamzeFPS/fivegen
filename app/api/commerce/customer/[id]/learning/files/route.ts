import {failure,sameOrigin} from '@/lib/server';
import {uploadStudentFile} from '@/lib/product-learning-server';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);return Response.json(await uploadStudentFile(req,(await params).id),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
