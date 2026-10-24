import {requireChatGPTUser} from '@/app/chatgpt-auth';
import {CollaborationInvitation} from '../../workspace';
export const dynamic='force-dynamic';
export const metadata={title:'Product invitation — FiveGen',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function Page({params}:{params:Promise<{token:string}>}){const {token}=await params;await requireChatGPTUser('/collaborate/invite/'+encodeURIComponent(token));return <CollaborationInvitation token={token}/>;}
