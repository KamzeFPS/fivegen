import {requireChatGPTUser} from '@/app/chatgpt-auth';
import ClipperWorkspace from '../workspace';

export const metadata={title:'Campaigns · FiveGen Clipper',robots:{index:false,follow:false}};
export default async function ClipperApp({searchParams}:{searchParams:Promise<{lang?:string}>}){
  const params=await searchParams;
  const lang=params.lang==='en'?'en':'mn';
  const user=await requireChatGPTUser('/clipper/app?lang='+lang);
  return <ClipperWorkspace lang={lang} user={user}/>;
}
