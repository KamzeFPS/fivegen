import {requireAdmin} from '@/lib/admin';
import {failure} from '@/lib/server';
import {walletReadiness} from '@/lib/wallet-readiness';

export async function GET(req:Request){
  try{await requireAdmin();return Response.json(await walletReadiness(new URL(req.url).origin),{headers:{'Cache-Control':'no-store'}});}
  catch(error){return failure(error);}
}
