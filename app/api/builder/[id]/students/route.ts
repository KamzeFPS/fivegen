import {failure,identity,sameOrigin} from '@/lib/server';
import {creatorProductStudents,creatorStudentAction} from '@/lib/product-learning-server';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{const user=await identity();return Response.json(await creatorProductStudents((await params).id,user.userId),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){try{sameOrigin(req);const user=await identity();return Response.json(await creatorStudentAction((await params).id,user.userId,await req.json()),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
