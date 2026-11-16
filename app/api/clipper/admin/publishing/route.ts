import {requireAdmin} from '@/lib/admin';
import {sameOrigin} from '@/lib/server';
import {clipperJsonBody,clipperResponse,clipperFailure} from '@/lib/clipper-server';
import {getClipperPublishingConfig,saveClipperPublishingConfig} from '@/lib/clipper-publishing';
export async function GET(){try{await requireAdmin();return clipperResponse(await getClipperPublishingConfig());}catch(error){return clipperFailure(error);}}
export async function PUT(request:Request){try{sameOrigin(request);const user=await requireAdmin();return clipperResponse(await saveClipperPublishingConfig(user.userId,await clipperJsonBody(request)));}catch(error){return clipperFailure(error);}}
