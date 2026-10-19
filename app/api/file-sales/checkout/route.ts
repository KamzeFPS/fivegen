import {failure,sameOrigin} from '@/lib/server';
import {startFileSaleCheckout,fileSaleHeaders} from '@/lib/file-sales';
export async function POST(req:Request){try{sameOrigin(req);return Response.json(await startFileSaleCheckout(req,await req.json()),{headers:fileSaleHeaders});}catch(e){return failure(e);}}
