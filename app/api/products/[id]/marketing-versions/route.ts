import { z } from 'zod';
import { identity,sameOrigin,failure } from '@/lib/server';
import { listMarketingVersions,marketingVersion } from '@/lib/marketing-versions-server';
import { getCampaign,saveCampaign } from '@/lib/campaign-server';
import { getGrowth,saveGrowth } from '@/lib/growth-server';
import { campaignSaveSchema } from '@/lib/campaign';
import { growthSaveSchema } from '@/lib/growth';
import { readCreatorContextJson } from '@/lib/creator-context-request';
type Context={params:Promise<{id:string}>};const headers={'Cache-Control':'private, no-store'};
export async function GET(req:Request,{params}:Context){try{const user=await identity(),id=(await params).id,url=new URL(req.url),kind=z.enum(['campaign','growth']).parse(url.searchParams.get('kind')),version=url.searchParams.get('version'),campaignId=url.searchParams.get('campaignId')||undefined;return Response.json(version?{snapshot:await marketingVersion(user.userId,id,kind,version,campaignId)}:{versions:await listMarketingVersions(user.userId,id,kind,campaignId)},{headers});}catch(e){return failure(e);}}
export async function POST(req:Request,{params}:Context){try{sameOrigin(req);const user=await identity(),id=(await params).id,input=z.object({kind:z.enum(['campaign','growth']),version:z.string().uuid(),expectedUpdatedAt:z.number().int().nonnegative(),campaignId:z.string().uuid().optional()}).strict().parse(await readCreatorContextJson(req,2048)),snapshot=await marketingVersion(user.userId,id,input.kind,input.version,input.campaignId);
 if(input.kind==='campaign'){const parsed=campaignSaveSchema.parse({...snapshot,expectedUpdatedAt:input.expectedUpdatedAt}),current=await getCampaign(id,user.userId,input.campaignId);const campaign=await saveCampaign(id,user.userId,{...parsed,id:current.id,items:parsed.items.map(item=>({...item,status:'draft',scheduledAt:null})),expectedUpdatedAt:input.expectedUpdatedAt});return Response.json({campaign,notice:'Earlier copy restored as unapproved drafts. Nothing already published or sent was rolled back.',previousRevision:current.updatedAt},{headers});}
 const parsed=growthSaveSchema.parse({...snapshot,expectedUpdatedAt:input.expectedUpdatedAt});await getGrowth(id,user.userId);return Response.json({growth:await saveGrowth(id,user.userId,parsed),notice:'Earlier copy restored as an editable draft. Public pages remain unchanged.'},{headers});
 }catch(e){return failure(e);}}
