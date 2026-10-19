import { ApiError, failure, sameOrigin } from '@/lib/server';
import { trackGrowthEvent } from '@/lib/growth-analytics';
export async function POST(request: Request) {
  try { sameOrigin(request); const body = await request.text(); if(body.length>1000)throw new ApiError('Event too large.',413);let input:unknown;try{input=JSON.parse(body);}catch{throw new ApiError('Invalid event.');}return Response.json(await trackGrowthEvent(input),{headers:{'Cache-Control':'no-store'}}); }
  catch(error){return failure(error);}
}
