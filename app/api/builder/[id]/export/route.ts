import {failure,identity} from '@/lib/server';
import {getBuilderWorkspace} from '@/lib/product-builder-server';
import {productHtml} from '@/lib/export';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{
 const user=await identity(),{id}=await params,workspace=await getBuilderWorkspace(id,user.userId),{draft,product}=workspace;
 const html=productHtml({...product,title:draft.title,description:draft.description,content:{sections:draft.sections,files:draft.files,benefits:[],launch:''}});
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Content-Disposition':`attachment; filename="${product.slug}.html"`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
}catch(error){return failure(error);}}
