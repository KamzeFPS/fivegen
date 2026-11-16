import {clipperFailure as failure} from '@/lib/clipper-server';
import {requireAdmin} from '@/lib/admin';

import {getClipperAdmin,clipperResponse} from '@/lib/clipper-server';
import {getPublishingState} from '@/lib/clipper-publishing';
export async function GET(){try{await requireAdmin();const state=await getClipperAdmin();return clipperResponse({...state,publishing:await getPublishingState(state.submissions.map(item=>item.id))});}catch(error){return failure(error);}}
