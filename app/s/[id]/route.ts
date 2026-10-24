import {failure} from '@/lib/server';
import {campaignShareDestination} from '@/lib/campaign-share-links-server';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){try{const destination=await campaignShareDestination((await params).id),target=new URL(destination.path,req.url);target.searchParams.set('utm_campaign',destination.campaign);target.searchParams.set('utm_source',destination.channel);return Response.redirect(target.href,302);}catch(error){return failure(error);}}
