import {z} from 'zod';
import {database,failure,identity,sameOrigin} from '@/lib/server';
import {acceptedTerms,TERMS_VERSION} from '@/lib/terms';
export async function GET(){try{const u=await identity({allowUnaccepted:true});return Response.json({accepted:await acceptedTerms(u.userId),version:TERMS_VERSION});}catch(e){return failure(e);}}
export async function POST(req:Request){try{
 sameOrigin(req);const u=await identity({allowUnaccepted:true});z.object({accepted:z.literal(true),version:z.literal(TERMS_VERSION)}).strict().parse(await req.json());
 await database().prepare('INSERT OR IGNORE INTO terms_acceptances (id,owner,version,email,accepted_at) VALUES (?,?,?,?,?)').bind(`${u.userId}:${TERMS_VERSION}`,u.userId,TERMS_VERSION,u.email,Date.now()).run();return Response.json({accepted:true});
}catch(e){return failure(e);}}
