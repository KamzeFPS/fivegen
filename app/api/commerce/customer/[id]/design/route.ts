import {ApiError,failure} from '@/lib/server';
import {customerOrder} from '@/lib/commerce-v2-server';
import {builderBuyerDelivery} from '@/lib/builder-delivery-server';
import {designDocumentSchema} from '@/lib/design-document';
import {designHasFinishedPages} from '@/lib/product-readiness';
import {DesignExportError,exportDesign} from '@/lib/design-export';
import {verifiedDesignAssets} from '@/lib/design-assets-server';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{
 const {id}=await params,order=await customerOrder(req,id),snapshot=await builderBuyerDelivery(id),query=new URL(req.url).searchParams,format=query.get('format')||'pdf';
 if(!['pdf','zip'].includes(format))throw new ApiError('Choose a printable PDF or the design ZIP package.');
 if(!snapshot?.studio?.design||!designHasFinishedPages(snapshot.studio.design))throw new ApiError('This purchase does not include a finished design.',404);
 const document=designDocumentSchema.parse(snapshot.studio.design),assets=await verifiedDesignAssets(document,String(order.product_id),String(order.owner)),result=await exportDesign(document,format as 'pdf'|'zip',assets);
 return new Response(result.bytes.slice().buffer as ArrayBuffer,{headers:{'Content-Type':result.mime,'Content-Disposition':`attachment; filename="design.${result.extension}"`,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; img-src data:; sandbox"}});
}catch(error){return failure(error instanceof DesignExportError?new ApiError(error.message,error.status):error);}}
