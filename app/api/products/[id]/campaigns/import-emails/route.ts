import { identity,sameOrigin,failure } from '@/lib/server';
import { campaignEmailImportPreview,importCampaignEmails } from '@/lib/campaign-email-import-server';
import { readCreatorContextJson } from '@/lib/creator-context-request';
type Context={params:Promise<{id:string}>};const headers={'Cache-Control':'private, no-store'};
export async function GET(req:Request,{params}:Context){try{const user=await identity();return Response.json(await campaignEmailImportPreview((await params).id,user.userId,new URL(req.url).searchParams.get('campaignId')||undefined),{headers});}catch(e){return failure(e);}}
export async function POST(req:Request,{params}:Context){try{sameOrigin(req);const user=await identity();return Response.json(await importCampaignEmails((await params).id,user.userId,await readCreatorContextJson(req,8192)),{headers});}catch(e){return failure(e);}}
