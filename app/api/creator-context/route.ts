import {z} from 'zod';
import {identity,sameOrigin,failure} from '@/lib/server';
import {creatorContextWorkspace,readCreatorProfile,saveCreatorProfile,deleteCreatorProfile} from '@/lib/creator-context-server';
import {readCreatorContextJson} from '@/lib/creator-context-request';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
export async function GET(req:Request){try{const user=await identity();if(new URL(req.url).searchParams.get('format')==='json'){const {updatedAt:_,...profile}=await readCreatorProfile(user.userId);void _;return Response.json({format:'fivegen-creator-profile',version:1,profile},{headers:{...headers,'Content-Disposition':'attachment; filename="creator-profile.json"'}});}return Response.json(await creatorContextWorkspace(user.userId),{headers});}catch(error){return failure(error);}}
export async function PUT(req:Request){try{sameOrigin(req);const user=await identity();return Response.json({profile:await saveCreatorProfile(user.userId,await readCreatorContextJson(req))},{headers});}catch(error){return failure(error);}}
export async function DELETE(req:Request){try{sameOrigin(req);const user=await identity(),value=z.object({expectedUpdatedAt:z.number().int().nonnegative()}).strict().parse(await readCreatorContextJson(req,1024));return Response.json({profile:await deleteCreatorProfile(user.userId,value.expectedUpdatedAt)},{headers});}catch(error){return failure(error);}}
