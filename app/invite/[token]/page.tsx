import {getChatGPTUser} from '@/app/chatgpt-auth';
import {InviteAcceptance} from '@/app/invite-acceptance';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{token:string}>}){const {token}=await params,user=await getChatGPTUser();return <InviteAcceptance token={token} email={user?.email}/>;}
