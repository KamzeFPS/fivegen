import {z} from 'zod';
import {ApiError,database,failure,identity,sameOrigin} from '@/lib/server';
import {builderBrief} from '@/lib/builder-contract';
import {briefSchema} from '@/lib/product';
import {builderHeaders,captureGeneratedBuilderResult,getBuilderWorkspace,syncGeneratedBuilderContent} from '@/lib/product-builder-server';
import {GET as generationStatus,POST as generationStep,DELETE as stopGeneration} from '@/app/api/products/[id]/generate/route';
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,context:Context){
 const response=await generationStatus(req,context);if(!response.ok)return response;
 const user=await identity(),{id}=await context.params,result=await response.json() as {job:Record<string,unknown>|null};
 if(result.job){const row=await database().prepare('SELECT brief FROM generation WHERE product_id=? AND owner=?').bind(id,user.userId).first();if(row)result.job.appliedVersion=JSON.parse(String(row.brief)).builderAppliedVersion||null;}
 return Response.json(result,{headers:builderHeaders});
}
export async function POST(req:Request,context:Context){try{
 sameOrigin(req);const user=await identity(),{id}=await context.params;
 const input=z.object({action:z.enum(['start','step','apply','stop']),expectedVersion:z.number().int().min(1),allowCredits:z.boolean().default(false),maxStepCredits:z.number().int().min(0).max(160).optional()}).parse(await req.json());
 const workspace=await getBuilderWorkspace(id,user.userId);if(workspace.version!==input.expectedVersion)throw new ApiError('Your draft changed. Reload before continuing generation.',409);
 if(input.action==='apply')return Response.json(await syncGeneratedBuilderContent(id,user.userId,input.expectedVersion),{headers:builderHeaders});
 if(input.action==='stop')return stopGeneration(req,context);
 if(input.action==='start'){
  const brief=briefSchema.parse(builderBrief(workspace.draft));
  const job=await database().prepare('SELECT * FROM generation WHERE product_id=? AND owner=?').bind(id,user.userId).first();
  if(job?.status==='completed')throw new ApiError('The AI result is ready. Apply it, or keep editing your current product.',409);
  if(!job)await database().prepare("INSERT OR IGNORE INTO generation (product_id,owner,brief,stage,status,lease,updated_at) SELECT ?,?,?,-1,'queued',0,? WHERE EXISTS(SELECT 1 FROM products WHERE id=? AND owner=?)").bind(id,user.userId,JSON.stringify(brief),Date.now(),id,user.userId).run();
 }
 const response=await generationStep(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify({allowCredits:input.allowCredits,maxStepCredits:input.maxStepCredits})}),context);
 if(response.ok){const result=await response.clone().json() as {done?:boolean};if(result.done)await captureGeneratedBuilderResult(id,user.userId);}
 return response;
}catch(error){return failure(error);}}
