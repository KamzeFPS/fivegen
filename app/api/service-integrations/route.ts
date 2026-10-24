import {failure,identity} from '@/lib/server';
import {serviceIntegrationStatus} from '@/lib/service-integrations-oauth';
export async function GET(){try{const user=await identity();return Response.json(await serviceIntegrationStatus(user.userId),{headers:{'Cache-Control':'private, no-store'}});}catch(error){return failure(error);}}
