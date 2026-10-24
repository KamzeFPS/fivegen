import {failure,identity} from '@/lib/server';
import {creatorTeamLicenses} from '@/lib/product-team-server';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{const user=await identity(),{id}=await params;return Response.json(await creatorTeamLicenses(id,user.userId),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
