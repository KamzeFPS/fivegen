import {requireChatGPTUser} from '@/app/chatgpt-auth';
import {isAdmin} from '@/lib/admin';
import {redirect} from 'next/navigation';
import ClipperWorkspace from '../workspace';

export const metadata={title:'Campaign management · FiveGen Clipper',robots:{index:false,follow:false}};
export default async function ClipperAdmin({searchParams}:{searchParams:Promise<{lang?:string}>}){
  const params=await searchParams;
  const lang=params.lang==='en'?'en':'mn';
  const user=await requireChatGPTUser('/clipper/admin?lang='+lang);
  if(!isAdmin(user))redirect('/clipper/app?lang='+lang);
  return <ClipperWorkspace lang={lang} user={user} admin/>;
}
