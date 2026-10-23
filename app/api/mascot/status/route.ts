import {failure} from '@/lib/server';
import {mascotStatus} from '@/lib/mascot-server';

export async function GET(){try{return Response.json(await mascotStatus(),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
