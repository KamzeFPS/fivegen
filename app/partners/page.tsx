import {requireChatGPTUser} from '@/app/chatgpt-auth';
import {ReferralPanel} from '@/app/referral-panel';
import {Brand} from '@/app/ui-brand';
export const dynamic='force-dynamic';
export default async function Page(){await requireChatGPTUser('/partners');return <div className="member-shell"><nav><a href="/"><Brand/></a><a href="/">Back to studio</a></nav><PartnerDashboard/></div>;}
function PartnerDashboard(){return <ReferralPanel products={[]} pro={false} initialTab="earnings"/>;}
