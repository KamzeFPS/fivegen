import {z} from 'zod';
import {failure,identity,sameOrigin} from '@/lib/server';
import {readCreatorContextJson} from '@/lib/creator-context-request';
import {publicPageExperiment,assignPageExperiment,revokePageExperiment} from '@/lib/page-experiment-server';
const slug=z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/),input=z.object({slug,sessionId:z.string().uuid(),consent:z.boolean()}).strict(),headers={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};
const privateMode=(req:Request)=>req.headers.get('dnt')==='1'||req.headers.get('sec-gpc')==='1';
export async function GET(req:Request){try{if(privateMode(req))return Response.json({available:false},{headers});return Response.json(await publicPageExperiment(slug.parse(new URL(req.url).searchParams.get('slug'))),{headers});}catch(error){return failure(error);}}
export async function POST(req:Request){try{sameOrigin(req);if(privateMode(req))return Response.json({assignment:null},{headers});const value=input.parse(await readCreatorContextJson(req,4000));if(!value.consent)return Response.json(await revokePageExperiment(value.slug,value.sessionId),{headers});let excludedOwner='';try{excludedOwner=(await identity()).userId;}catch{/* Anonymous visitors are eligible only after the explicit consent field. */}return Response.json({assignment:await assignPageExperiment(value.slug,value.sessionId,excludedOwner)},{headers});}catch(error){return failure(error);}}
