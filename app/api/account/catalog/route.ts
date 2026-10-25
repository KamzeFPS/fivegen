import {failure,identity,sameOrigin} from '@/lib/server';
import {getCreatorCatalog,saveCreatorCatalog,publishCreatorCatalog} from '@/lib/creator-catalog-server';
const headers={'Cache-Control':'private, no-store'};
export async function GET(){try{const user=await identity();return Response.json(await getCreatorCatalog(user.userId),{headers});}catch(error){return failure(error);}}
export async function PATCH(req:Request){try{sameOrigin(req);const user=await identity();return Response.json(await saveCreatorCatalog(user.userId,await req.json()),{headers});}catch(error){return failure(error);}}
export async function POST(req:Request){try{sameOrigin(req);const user=await identity();return Response.json(await publishCreatorCatalog(user.userId,await req.json()),{headers});}catch(error){return failure(error);}}
