import {clipperFailure as failure} from '@/lib/clipper-server';
import {requireAdmin} from '@/lib/admin';

import {getClipperAdmin,clipperResponse} from '@/lib/clipper-server';
export async function GET(){try{await requireAdmin();return clipperResponse(await getClipperAdmin());}catch(error){return failure(error);}}
