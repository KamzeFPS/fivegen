import {ApiError,failure} from '@/lib/server';
import {exportBuyerBook} from '@/lib/book-buyer-export';
import {ProductDocumentError} from '@/lib/product-document-archive';

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{
 const {id}=await params,format=new URL(req.url).searchParams.get('format')||'pdf';
 return await exportBuyerBook(req,id,format);
}catch(error){return failure(error instanceof ProductDocumentError?new ApiError(error.message,error.status):error);}}
