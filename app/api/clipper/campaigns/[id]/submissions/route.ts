import {identity,sameOrigin,ApiError} from '@/lib/server';
import {clipperFailure} from '@/lib/clipper-server';
/** Previously submitted links remain readable. New contributions are files. */
export async function POST(request:Request){try{sameOrigin(request);await identity();throw new ApiError('Upload an MP4 video file to this campaign instead of a social link.',410);}catch(error){return clipperFailure(error);}}
