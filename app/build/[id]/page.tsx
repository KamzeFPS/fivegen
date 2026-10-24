import {requireChatGPTUser} from '@/app/chatgpt-auth';
import ProductBuilder from '@/app/product-builder';
export const dynamic='force-dynamic';
export default async function BuilderPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {id}=await params,query=await searchParams,kept=new URLSearchParams();
 for(const key of ['type','source','area','mode','tab','customize','connect'])if(typeof query[key]==='string')kept.set(key,query[key]);
 const user=await requireChatGPTUser(`/build/${encodeURIComponent(id)}${kept.size?'?'+kept:''}`);return <ProductBuilder initialId={id} user={{name:user.displayName,email:user.email}}/>;
}
