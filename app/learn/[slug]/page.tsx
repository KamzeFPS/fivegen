import {requireChatGPTUser} from '@/app/chatgpt-auth';
import LearningRoom from '@/app/learning-room';
import {database} from '@/lib/server';
import {redirect} from 'next/navigation';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{slug:string}>}){const {slug}=await params;if(await database().prepare('SELECT p.id FROM products p JOIN file_sale_drafts d ON d.product_id=p.id WHERE p.slug=?').bind(slug).first())redirect(`/access/${slug}`);return <SignedRoom slug={slug}/>;}
async function SignedRoom({slug}:{slug:string}){await requireChatGPTUser(`/learn/${slug}`);return <LearningRoom slug={slug}/>;}
