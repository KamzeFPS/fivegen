import {failure,sameOrigin} from '@/lib/server';
import {recordJourneyEvent} from '@/lib/journey-server';
export async function POST(req:Request){try{sameOrigin(req);if(req.headers.get('dnt')==='1'||req.headers.get('sec-gpc')==='1')return Response.json({recorded:false,reason:'privacy preference'},{headers:{'Cache-Control':'no-store'}});return Response.json(await recordJourneyEvent(await req.json()),{headers:{'Cache-Control':'no-store'}});}catch(error){return failure(error);}}
