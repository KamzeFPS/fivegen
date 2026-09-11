import {requireChatGPTUser} from '@/app/chatgpt-auth';
import LearningRoom from '@/app/learning-room';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;return <SignedRoom slug={slug}/>;}
async function SignedRoom({slug}:{slug:string}){await requireChatGPTUser(`/learn/${slug}`);return <LearningRoom slug={slug}/>;}
