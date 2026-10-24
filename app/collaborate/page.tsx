import {requireChatGPTUser} from '@/app/chatgpt-auth';
import {CollaborationList} from './workspace';
export const dynamic='force-dynamic';
export const metadata={title:'Shared with me — FiveGen',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function Page(){await requireChatGPTUser('/collaborate');return <CollaborationList/>;}
