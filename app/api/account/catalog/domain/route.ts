import {failure,identity,sameOrigin} from '@/lib/server';
import {configureCatalogDomain} from '@/lib/creator-catalog-server';
export async function POST(req:Request){try{sameOrigin(req);const user=await identity();return Response.json(await configureCatalogDomain(user.userId,await req.json()),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
