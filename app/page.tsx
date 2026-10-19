import Studio from "./generator-studio";
import { getChatGPTUser } from "./chatgpt-auth";
import {acceptedTerms} from '@/lib/terms';
import {redirect} from 'next/navigation';
export const dynamic = "force-dynamic";
export default async function Home({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const user = await getChatGPTUser();
  if(user&&!await acceptedTerms(user.userId)){const query=await searchParams,returnQuery=new URLSearchParams();for(const [key,value] of Object.entries(query))if(typeof value==='string')returnQuery.set(key,value);redirect('/welcome?return_to='+encodeURIComponent('/'+(returnQuery.size?'?'+returnQuery:'')));}
  return (
    <Studio
      user={user ? { name: user.displayName, email: user.email } : null}
    />
  );
}
