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
function lookup(address,origin=base){return new Request(`${base}/api/admin/credits/grant?email=${encodeURIComponent(address)}`,{headers:{origin}});}
try{
  allowed=false;assert.equal((await route.POST(request({email,credits:50,requestId}))).status,403);assert.equal((await route.GET(lookup(email))).status,403);allowed=true;
  assert.equal((await route.GET(lookup('invalid'))).status,400);
  assert.equal((await route.GET(lookup('missing@example.test'))).status,404);
  assert.equal((await route.GET(lookup(email,'https://attacker.test'))).status,403);
  const emptyHistory=await route.GET(lookup(` ${email.toUpperCase()} `));assert.equal(emptyHistory.status,200);assert.equal(emptyHistory.headers.get('cache-control'),'no-store');assert.deepEqual(await emptyHistory.json(),{email,purchasedBalance:0,grants:[],hasMore:false});
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM wallets WHERE owner=?').get(owner).n,0,'Reading history does not create a wallet');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM credit_admin_grants').get().n,0,'Reading history does not issue a grant');
  assert.equal((await route.POST(request({email:'missing@example.test',credits:50,requestId:randomUUID()}))).status,404);
  assert.equal((await route.POST(request({email,credits:1001,requestId:randomUUID()}))).status,400);
  const first=await route.POST(request({email,credits:50,requestId}));assert.equal(first.status,200);assert.deepEqual(await first.json(),{email,creditsGranted:50,purchasedBalance:50});
  const retry=await route.POST(request({email,credits:50,requestId}));assert.equal(retry.status,200);assert.equal(sql.prepare('SELECT purchased FROM wallets WHERE owner=?').get(owner).purchased,50,'Retry is idempotent');
  assert.equal((await route.POST(request({email,credits:51,requestId}))).status,409,'A request ID cannot be reused with a different grant');
  assert.equal((await route.POST(request({email,credits:50,requestId:randomUUID()},'https://attacker.test'))).status,403,'Cross-origin grants are rejected');
  assert.equal(sql.prepare('SELECT COUNT(*) n FROM credit_admin_grants WHERE owner=?').get(owner).n,1);
  sql.prepare('INSERT INTO terms_acceptances (id,owner,version,email,accepted_at) VALUES (?,?,?,?,?)').run('terms-other','other-owner','current','other@example.test',Date.now());
  sql.prepare('INSERT INTO credit_admin_grants (id,owner,email,credits,admin,applied,created_at) VALUES (?,?,?,?,?,?,?)').run('other-grant','other-owner','other@example.test',999,admin.userId,1,Date.now());
  const historyResponse=await route.GET(lookup(email)),history=await historyResponse.json();assert.equal(historyResponse.status,200);assert.equal(history.purchasedBalance,50);assert.equal(history.hasMore,false);assert.equal(history.grants.length,1);assert.deepEqual(Object.keys(history.grants[0]).sort(),['applied','created_at','credits','id']);assert.equal(history.grants[0].id,requestId);assert.equal(history.grants[0].credits,50);assert.equal(history.grants[0].applied,true);assert.ok(history.grants[0].created_at>0);
  assert.equal(sql.prepare('SELECT purchased FROM wallets WHERE owner=?').get(owner).purchased,50,'History lookup cannot duplicate an existing grant');
  sql.prepare('INSERT INTO credit_admin_grants (id,owner,email,credits,admin,applied,created_at) VALUES (?,?,?,?,?,?,?)').run('unapplied-grant',owner,email,12,admin.userId,0,Date.now()+1);
  const pending=await (await route.GET(lookup(email))).json();assert.equal(pending.grants.find(grant=>grant.id==='unapplied-grant').applied,false,'An unapplied audit row is distinguishable without applying it');assert.equal(pending.purchasedBalance,50);
  for(let i=0;i<101;i++)sql.prepare('INSERT INTO credit_admin_grants (id,owner,email,credits,admin,applied,created_at) VALUES (?,?,?,?,?,?,?)').run(`old-grant-${i}`,owner,email,1,admin.userId,1,i);
  const bounded=await (await route.GET(lookup(email))).json();assert.equal(bounded.grants.length,100);assert.equal(bounded.hasMore,true);assert.equal(bounded.grants[0].id,'unapplied-grant');assert.equal(bounded.purchasedBalance,50);
  console.log('Passed: admin-only read-only account history, normalized lookup, account isolation, bounded audit records, and existing idempotent credit grants.');
}finally{storage.close();}
