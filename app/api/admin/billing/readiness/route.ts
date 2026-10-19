import {requireAdmin} from '@/lib/admin';
import {failure} from '@/lib/server';
import {walletReadiness} from '@/lib/wallet-readiness';
import {commerceReadiness} from '@/lib/commerce-readiness';

export async function GET(req:Request){
  try{await requireAdmin();const origin=new URL(req.url).origin;const [wallet,commerce]=await Promise.all([walletReadiness(origin),commerceReadiness(origin)]);return Response.json({...wallet,commerce},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return failure(error);}
}
