import {ApiError,failure,sameOrigin} from '@/lib/server';
import {publicPageLeadSchema} from '@/lib/public-pages';
import {capturePublicPageLead,resolvePublishedPage} from '@/lib/public-pages-server';
import {limitLeadCapture} from '@/lib/growth-funnel-server';
export async function POST(request:Request){try{sameOrigin(request);const body=await request.text();if(body.length>5000)throw new ApiError('Please shorten your response.',413);const input=publicPageLeadSchema.parse(JSON.parse(body)),page=await resolvePublishedPage(input.pageId);await limitLeadCapture(page.productId,input.email);return Response.json(await capturePublicPageLead(input),{headers:{'Cache-Control':'no-store'}});}catch(e){return failure(e);}}
