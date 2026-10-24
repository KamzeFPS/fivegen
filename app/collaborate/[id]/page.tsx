import {requireChatGPTUser} from '@/app/chatgpt-auth';
import {CollaborativeWorkspace} from '../workspace';
export const dynamic='force-dynamic';
export const metadata={title:'Collaborate — FiveGen',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;await requireChatGPTUser('/collaborate/'+encodeURIComponent(id));return <CollaborativeWorkspace id={id}/>;}
