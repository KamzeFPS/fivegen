import {clipperFailure as failure} from '@/lib/clipper-server';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {isAdmin} from '@/lib/admin';

import {getClipperCampaigns,getClipperMember,clipperResponse} from '@/lib/clipper-server';
export async function GET(){try{
 const user=await getChatGPTUser();const [campaigns,member]=await Promise.all([getClipperCampaigns(),user?getClipperMember(user.userId):Promise.resolve({profile:null,memberships:[],submissions:[]})]);
 return clipperResponse({campaigns,...member,isAdmin:user?isAdmin(user):false,user:user?{userId:user.userId,displayName:user.displayName,email:user.email}:null});
}catch(error){return failure(error);}}
