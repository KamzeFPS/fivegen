import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import ts from 'typescript';
import {createStorage} from '../runtime/render/storage.mjs';

// Exercise the shipped query and route against the production SQLite schema.
// No payment client or email transport is loaded by this fixture.
const root=resolve('outputs/mascot-qa',randomUUID()),storage=createStorage(root),db=storage.sqlite;
class ApiError extends Error{constructor(message,status=400){super(message);this.status=status;}}
const config={STRIPE_MODE:'test'},owner='mascot-owner',otherOwner='other-owner',productId=randomUUID(),now=Date.now();
let user={userId:owner,email:'private-creator@example.test'},databaseReads=0,lastQuery='';
const deps={ApiError,binding:name=>config[name]||'',identity:async()=>{if(!user)throw new ApiError('Sign in',401);return user;},database:()=>{databaseReads++;return {prepare:sql=>{lastQuery=sql;return storage.DB.prepare(sql);}};},failure:error=>Response.json({error:error.message},{status:error.status||500})};
async function sourceModule(source){const key='mascotQa'+randomUUID().replaceAll('-','');globalThis[key]=deps;const code=`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;const result=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));delete globalThis[key];Object.assign(deps,result);return result;}
const core=readFileSync('lib/commerce-v2-server.ts','utf8');await sourceModule(core.slice(core.indexOf('export function commerceMode'),core.indexOf('// A dedicated seller key')));
const server=await sourceModule(readFileSync('lib/mascot-server.ts','utf8').replace(/^import[\s\S]*?;\r?\n/gm,''));
const route=await sourceModule(readFileSync('app/api/mascot/status/route.ts','utf8').replace(/^import[\s\S]*?;\r?\n/gm,''));
function sale({id=randomUUID(),account=owner,mode='test',status='paid',amount=1900,paidAt=now,currency='usd',payment='pi_'+id}={}){db.prepare("INSERT INTO commerce_orders(id,owner,product_id,account_id,mode,email,amount,currency,title,status,access_hash,payment_intent,created_at,paid_at) VALUES(?,?,?,'acct_mascot',?,'private-buyer@example.test',?,?,'Private buyer product title',?,'private-access-token',?,?,?)").run(id,account,productId,mode,amount,currency,status,payment,now,paidAt);return id;}
function earnings(id,{refunded=0,disputed=0}={}){db.prepare('INSERT INTO commerce_earnings(order_id,charge_id,charge_application_fee_amount,refunded_amount,disputed,updated_at) VALUES(?,?,0,?,?,?)').run(id,'ch_'+id,refunded,disputed,now);}
try{
 let result=await server.mascotStatus();assert.deepEqual({...result,ownerKey:''},{ownerKey:'',configured:true,mode:'test',paidSales:0,latestSale:null});assert.equal(result.ownerKey,createHash('sha256').update('fivegen:mascot:owner:v1:'+owner).digest('hex'));assert.ok(!result.ownerKey.includes(owner));
 const first=sale();sale({account:otherOwner,paidAt:now+5000});const live=sale({mode:'live',paidAt:now+5000});
 sale({status:'pending',paidAt:now+5000});sale({status:'revoked',paidAt:now+5000});sale({amount:0,paidAt:now+5000});sale({amount:-100,paidAt:now+5000});sale({paidAt:null});
 const revoked=sale({paidAt:now+5000});db.prepare("INSERT INTO commerce_revocations(key,account_id,mode,payment_intent,reason,created_at) VALUES(?,'acct_mascot','test',?,'refunded',?)").run('test:acct_mascot:pi_'+revoked,'pi_'+revoked,now);
 const refunded=sale({paidAt:now+5000}),disputed=sale({paidAt:now+5000});earnings(refunded,{refunded:1});earnings(disputed,{disputed:1});
 result=await server.mascotStatus();assert.equal(result.paidSales,1,'Only verified positive paid payments in this owner and explicit mode count');assert.equal(result.latestSale.id,first);
 const bundleParent=sale({paidAt:now+100}),bundleChild=sale({amount:500,paidAt:now+99999});db.prepare('INSERT INTO product_bundle_entitlements(parent_order_id,order_id,product_id) VALUES(?,?,?)').run(bundleParent,bundleChild,productId);
 const renewal=sale({paidAt:now+200});db.prepare('INSERT INTO product_subscription_renewals(order_id,parent_order_id,invoice_id) VALUES(?,?,?)').run(renewal,first,'in_'+renewal);
 result=await server.mascotStatus();assert.equal(result.paidSales,3,'A bundle counts its payment once and a new paid renewal is a real payment');assert.equal(result.latestSale.id,renewal);
 sale({id:'same-time-a',paidAt:now+1000,currency:'jpy',amount:1500});sale({id:'same-time-z',paidAt:now+1000,currency:'jpy',amount:2500});const readsBefore=databaseReads;result=await server.mascotStatus();assert.equal(databaseReads,readsBefore+1,'A single bounded-result read returns count and cursor consistently');assert.deepEqual(result.latestSale,{id:'same-time-z',paidAt:now+1000,amount:2500,currency:'jpy'});assert.equal(result.paidSales,5);assert.ok(db.prepare('EXPLAIN QUERY PLAN '+lastQuery).all(owner,'test',owner,'test').some(row=>String(row.detail).includes('commerce_order_owner')),'Reads use the existing owner/mode index');
 const response=await route.GET();assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');const payload=await response.json();assert.deepEqual(Object.keys(payload).sort(),['configured','latestSale','mode','ownerKey','paidSales']);assert.ok(!JSON.stringify(payload).includes('private-'),'No customer names, emails, product titles or access tokens leave the ledger');
 config.STRIPE_MODE='live';result=await server.mascotStatus();assert.equal(result.paidSales,1);assert.equal(result.latestSale.id,live);assert.equal(result.mode,'live');assert.equal(result.ownerKey,payload.ownerKey,'The opaque owner namespace is stable while mode remains explicit');
 user={userId:otherOwner,email:'other@example.test'};const other=await server.mascotStatus();assert.equal(other.paidSales,0);assert.notEqual(other.ownerKey,payload.ownerKey);config.STRIPE_MODE='test';assert.equal((await server.mascotStatus()).paidSales,1);user={userId:owner,email:'private-creator@example.test'};
 const newPayment=sale({paidAt:now+2000});assert.equal((await server.mascotStatus()).latestSale.id,newPayment);db.prepare("UPDATE commerce_orders SET status='revoked' WHERE id=?").run(newPayment);result=await server.mascotStatus();assert.equal(result.latestSale.id,'same-time-z');assert.equal(result.paidSales,5,'Refunding a sale removes it without inventing another payment');
 for(const missingMode of ['', 'invalid']){config.STRIPE_MODE=missingMode;const before=databaseReads;result=await server.mascotStatus();assert.deepEqual({...result,ownerKey:''},{ownerKey:'',configured:false,mode:null,paidSales:0,latestSale:null});assert.equal(databaseReads,before,'An unconfigured mode does not query the payment ledger');assert.equal((await route.GET()).status,200);}
 user=null;assert.equal((await route.GET()).status,401,'Authentication is required even when commerce is unconfigured');
 console.log('Mascot status passed: private authenticated owner/mode isolation, verified paid sales, refund/dispute/free/bundle exclusions, real renewals, deterministic latest cursor, indexed aggregate, and calm unconfigured mode.');
 console.log('QA records retained: '+root);
}finally{storage.close();}
