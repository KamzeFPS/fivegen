import {clipperFailure as failure} from '@/lib/clipper-server';
import {requireAdmin} from '@/lib/admin';
import {sameOrigin} from '@/lib/server';
import {saveClipperCampaign,clipperJsonBody,clipperResponse} from '@/lib/clipper-server';
export async function POST(request:Request){try{sameOrigin(request);const user=await requireAdmin();return clipperResponse(await saveClipperCampaign(user.userId,await clipperJsonBody(request)),201);}catch(error){return failure(error);}}
