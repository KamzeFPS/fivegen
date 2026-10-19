import { failure } from '@/lib/server';
import { verifyCommerceWebhook } from '@/lib/commerce-v2-server';
export async function POST(req:Request){try{await verifyCommerceWebhook(req);return Response.json({received:true});}catch(error){return failure(error);}}
