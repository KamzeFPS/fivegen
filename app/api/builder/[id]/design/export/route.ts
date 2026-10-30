import {ApiError,failure,identity} from '@/lib/server';
import {getBuilderWorkspace} from '@/lib/product-builder-server';
import {designDocumentSchema} from '@/lib/design-document';
import {DesignExportError,exportDesign} from '@/lib/design-export';
import {verifiedDesignAssets} from '@/lib/design-assets-server';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{
 const user=await identity(),{id}=await params,workspace=await getBuilderWorkspace(id,user.userId),query=new URL(req.url).searchParams,format=query.get('format')||'pdf';
 if(!['pdf','svg','json','zip'].includes(format))throw new ApiError('Choose PDF, SVG, JSON, or ZIP.');
 if(!workspace.draft.studio?.design)throw new ApiError('Create and save a design before exporting it.',404);
 const document=designDocumentSchema.parse(workspace.draft.studio.design),assets=await verifiedDesignAssets(document,id,user.userId),result=await exportDesign(document,format as 'pdf'|'svg'|'json'|'zip',assets,query.get('pageId')||undefined);
 return new Response(result.bytes.slice().buffer as ArrayBuffer,{headers:{'Content-Type':result.mime,'Content-Disposition':`attachment; filename="${workspace.product.slug}-design.${result.extension}"`,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; img-src data:; sandbox"}});
}catch(error){return failure(error instanceof DesignExportError?new ApiError(error.message,error.status):error);}}
