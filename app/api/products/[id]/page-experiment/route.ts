import {z} from 'zod';
import {failure,identity,sameOrigin} from '@/lib/server';
import {readCreatorContextJson} from '@/lib/creator-context-request';
import {pageExperimentDraftSchema,pageExperimentScope} from '@/lib/page-experiment';
import {pageExperimentWorkspace,savePageExperiment,activatePageExperiment,closePageExperiment} from '@/lib/page-experiment-server';
const baseline=z.object({pagePublishedAt:z.number().int().positive(),checkoutVersion:z.number().int().nonnegative(),offerUpdatedAt:z.number().int().nonnegative(),fileRevision:z.string().max(100),control:z.string().max(300),slug:z.string().max(120)}).strict();
const input=z.discriminatedUnion('action',[
 z.object({action:z.literal('save'),draft:pageExperimentDraftSchema,expectedRevision:z.number().int().nonnegative()}).strict(),
 z.object({action:z.literal('activate'),expectedRevision:z.number().int().positive(),baseline,acknowledgeScope:z.literal(true)}).strict(),
 z.object({action:z.literal('close'),runId:z.string().uuid()}).strict(),
]);
const headers={'Cache-Control':'private, no-store'};
type Context={params:Promise<{id:string}>};
export async function GET(_req:Request,{params}:Context){try{const user=await identity(),{id}=await params;return Response.json({workspace:await pageExperimentWorkspace(id,user.userId),scope:pageExperimentScope},{headers});}catch(error){return failure(error);}}
export async function POST(req:Request,{params}:Context){try{sameOrigin(req);const user=await identity(),{id}=await params,value=input.parse(await readCreatorContextJson(req,16000)),workspace=value.action==='save'?await savePageExperiment(id,user.userId,value.draft,value.expectedRevision):value.action==='activate'?await activatePageExperiment(id,user.userId,value.expectedRevision,value.baseline):await closePageExperiment(id,user.userId,value.runId);return Response.json({workspace,scope:pageExperimentScope},{headers});}catch(error){return failure(error);}}
