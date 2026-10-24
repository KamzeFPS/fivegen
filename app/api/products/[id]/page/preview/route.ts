import {ApiError,failure,identity,ownedProduct} from '@/lib/server';
import {getPublicProductPage} from '@/lib/product-page-server';
type Context={params:Promise<{id:string}>};
export async function GET(_request:Request,{params}:Context){
 try{const user=await identity(),{id}=await params,product=await ownedProduct(id,user.userId),page=await getPublicProductPage(String(product.slug));if(page.product.id!==id)throw new ApiError('This published page is unavailable.',404);return Response.json({page},{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}
}
