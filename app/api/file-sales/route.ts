import {failure,identity,sameOrigin} from '@/lib/server';
import {createFileSale,fileSaleHeaders} from '@/lib/file-sales';
export async function POST(req:Request){try{sameOrigin(req);const user=await identity();return Response.json(await createFileSale(user.userId,await req.json()),{status:201,headers:fileSaleHeaders});}catch(e){return failure(e);}}
