import {failure,identity,sameOrigin} from '@/lib/server';
import {pageMigrationInventory,importLegacyLeadPage} from '@/lib/page-migration-server';
type Context={params:Promise<{id:string}>};const headers={'Cache-Control':'private, no-store'};
export async function GET(_request:Request,{params}:Context){try{const u=await identity();return Response.json(await pageMigrationInventory((await params).id,u.userId),{headers});}catch(e){return failure(e);}}
export async function POST(request:Request,{params}:Context){try{sameOrigin(request);const u=await identity();return Response.json({page:await importLegacyLeadPage((await params).id,u.userId,await request.json())},{headers});}catch(e){return failure(e);}}
