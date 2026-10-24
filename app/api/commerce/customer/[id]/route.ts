import { ApiError, failure } from '@/lib/server';
import { customerProduct } from '@/lib/commerce-v2-server';
import { getPublicProductPage } from '@/lib/product-page-server';

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    // Purchase ownership and paid status are checked before loading any branding
    // or full lesson content. An unpublished profile never blocks paid access.
    const content=await customerProduct(req,id);
    let page=null;
    try{page=await getPublicProductPage(content.slug);}catch(error){if(!(error instanceof ApiError&&error.status===404))throw error;}
    return Response.json({...content,page},{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
  }catch(error){return failure(error);}
}
