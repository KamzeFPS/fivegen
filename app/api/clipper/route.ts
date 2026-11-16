import {clipperFailure as failure} from '@/lib/clipper-server';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {isAdmin} from '@/lib/admin';

import {getClipperCampaigns,getClipperMember,clipperResponse} from '@/lib/clipper-server';
import {getPublishingState} from '@/lib/clipper-publishing';
export async function GET(){try{
 const user=await getChatGPTUser();const [campaigns,member]=await Promise.all([getClipperCampaigns(),user?getClipperMember(user.userId):Promise.resolve({profile:null,memberships:[],submissions:[]})]);
 const publishing=user?await getPublishingState(member.submissions.map(item=>item.id)):[];
 return clipperResponse({campaigns,...member,publishing,isAdmin:user?isAdmin(user):false,user:user?{userId:user.userId,displayName:user.displayName,email:user.email}:null});
}catch(error){return failure(error);}}
