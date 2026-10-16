import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {z} from 'zod';
import {createStorage} from '../runtime/render/storage.mjs';

const root=resolve('outputs/admin-credit-grant-qa',randomUUID()),storage=createStorage(root),db=storage.DB,sql=storage.sqlite;
const admin={userId:'admin-user',email:'admin@example.test'};let allowed=true;
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const deps={z,ApiError,database:()=>db,failure:error=>Response.json({error:error.message},{status:error.status||('issues' in error?400:500)}),sameOrigin:request=>{if(request.headers.get('origin')!==new URL(request.url).origin)throw new ApiError('This request is not allowed.',403);},requireAdmin:async()=>{if(!allowed)throw new ApiError('Only the FiveGen administrator can manage platform AI.',403);return admin;}};
const key='grant_test_'+randomUUID().replaceAll('-','');globalThis[key]=deps;
const source=fs.readFileSync('app/api/admin/credits/grant/route.ts','utf8').replace(/^import[\s\S]*?;\r?\n/gm,'');
const code=`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const route=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));delete globalThis[key];
const email='s.boldoo10@gmail.com',owner='target-user',base='https://fivegen.test';
sql.prepare('INSERT INTO terms_acceptances (id,owner,version,email,accepted_at) VALUES (?,?,?,?,?)').run('terms-target',owner,'current',email,Date.now());
const requestId=randomUUID();
function request(body,origin=base){return new Request(`${base}/api/admin/credits/grant`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});}
try{
  allowed=false;assert.equal((await route.POST(request({email,credits:50,requestId}))).status,403);allowed=true;
  assert.equal((await route.POST(request({email:'missing@example.test',credits:50,requestId:randomUUID()}))).status,404);
  assert.equal((await route.POST(request({email,credits:1001,requestId:randomUUID()}))).status,400);
  const first=await route.POST(request({email,credits:50,requestId}));assert.equal(first.status,200);assert.deepEqual(await first.json(),{email,creditsGranted:50,purchasedBalance:50});
  const retry=await route.POST(request({email,credits:50,requestId}));assert.equal(retry.status,200);assert.equal(sql.prepare('SELECT purchased FROM wallets WHERE owner=?').get(owner).purchased,50,'Retry is idempotent');
  assert.equal((await route.POST(request({email,credits:51,requestId}))).status,409,'A request ID cannot be reused with a different grant');
  assert.equal((await route.POST(request({email,credits:50,requestId:randomUUID()},'https://attacker.test'))).status,403,'Cross-origin grants are rejected');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM credit_admin_grants WHERE owner=?').get(owner).n,1);
  console.log('Passed: admin-only, existing-account-only, same-origin, bounded and idempotent AI-credit grants with a permanent audit record.');
}finally{storage.close();}
