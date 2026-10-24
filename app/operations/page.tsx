import {requireChatGPTUser} from '@/app/chatgpt-auth';
import {OperationsWorkspace} from './workspace';
export const dynamic='force-dynamic';
export const metadata={title:'Attention & support — FiveGen',robots:{index:false,follow:false}};
export default async function Page(){await requireChatGPTUser('/operations');return <OperationsWorkspace/>;}
