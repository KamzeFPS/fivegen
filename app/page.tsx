import Studio from "./generator-studio";
import type {Metadata} from 'next';
import { getChatGPTUser } from "./chatgpt-auth";
import {acceptedTerms} from '@/lib/terms';
import {redirect} from 'next/navigation';
import {PublicHome} from './public-home';
import {homeStructuredData,isPublicHomeQuery,jsonLd,privatePageMetadata,publicPageMetadata,SEO_DESCRIPTION,SEO_HOME_TITLE} from '@/lib/seo';
export const dynamic = "force-dynamic";
type HomeQuery=Record<string,string|string[]|undefined>;
export async function generateMetadata({searchParams}:{searchParams:Promise<HomeQuery>}):Promise<Metadata> {
  const [user,query]=await Promise.all([getChatGPTUser(),searchParams]);
  return !user&&isPublicHomeQuery(query)?publicPageMetadata({title:SEO_HOME_TITLE,description:SEO_DESCRIPTION,path:'/'}):privatePageMetadata();
}
export default async function Home({searchParams}:{searchParams:Promise<HomeQuery>}) {
  const user = await getChatGPTUser();
  const query=await searchParams;
  if(user&&!await acceptedTerms(user.userId)){const returnQuery=new URLSearchParams();for(const [key,value] of Object.entries(query))if(typeof value==='string')returnQuery.set(key,value);redirect('/welcome?return_to='+encodeURIComponent('/'+(returnQuery.size?'?'+returnQuery:'')));}
  if(!user&&isPublicHomeQuery(query))return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(homeStructuredData())}}/><PublicHome/></>;
  return (
    <Studio
      user={user ? { name: user.displayName, email: user.email } : null}
    />
  );
}
