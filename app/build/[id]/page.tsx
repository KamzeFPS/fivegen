import {requireChatGPTUser} from '@/app/chatgpt-auth';
import ProductBuilder from '@/app/product-builder';
import {redirect} from 'next/navigation';
import {isMarketingWorkspaceArea} from '@/lib/marketing-plugins';
export const dynamic='force-dynamic';
export default async function BuilderPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {id}=await params,query=await searchParams,kept=new URLSearchParams();
 for(const key of ['type','source','area','mode','tab','page','customize','connect','campaign','design'])if(typeof query[key]==='string')kept.set(key,query[key]);
 const user=await requireChatGPTUser(`/build/${encodeURIComponent(id)}${kept.size?'?'+kept:''}`);
 if(isMarketingWorkspaceArea(query.area)){const marketing=new URLSearchParams({project:id,area:query.area});for(const key of ['campaign','page'])if(typeof query[key]==='string')marketing.set(key,query[key]);redirect('/?'+marketing);}
 return <ProductBuilder initialId={id} user={{name:user.displayName,email:user.email}}/>;
}
