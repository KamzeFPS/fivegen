import {database,failure,identity} from '@/lib/server';
import {creditBalance,reconcileCredits} from '@/lib/credits';
import {creditPolicy,textCredits} from '@/lib/credit-policy';
import {providerSettings} from '@/lib/ai';
export async function GET(req:Request){try{
 const user=await identity(),session=new URL(req.url).searchParams.get('session_id');
 if(session)await reconcileCredits(user.userId,session);
 const [history,settings,balance]=await Promise.all([database().prepare('SELECT operation,cost,state,created_at FROM credit_usage WHERE owner=? ORDER BY created_at DESC LIMIT 30').bind(user.userId).all(),providerSettings(),creditBalance(user.userId)]);
 return Response.json({balance,history:history.results,costs:{text:textCredits(settings.config.textProvider),image:creditPolicy.image,video:creditPolicy.video}});
}catch(error){return failure(error);}}
export async function POST(){return Response.json({error:'Use Plans & credits to purchase with Apple Pay or Google Pay.',url:'/pricing?type=packs'},{status:410});}
