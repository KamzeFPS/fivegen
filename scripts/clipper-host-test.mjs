import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {readClipperOrigin,clipperHostRequest} from '../runtime/render/clipper-host.mjs';

const canonical='https://www.fivegen.ai',clipperOrigin=readClipperOrigin({},canonical);
assert.equal(clipperOrigin,'https://clipper.fivegen.ai');
assert.equal(readClipperOrigin({},'https://app.example.test'),null);
assert.equal(readClipperOrigin({CLIPPER_ORIGIN:'https://clips.example.test'},canonical),'https://clips.example.test');
assert.equal(readClipperOrigin({CLIPPER_ORIGIN:'http://clipper.localhost:8788'},'http://localhost:5173'),'http://clipper.localhost:8788');
for(const value of [canonical,'http://clipper.example.test','https://clipper.fivegen.ai/path','https://clipper.fivegen.ai?token=value','https://user:password@clipper.fivegen.ai'])
  assert.throws(()=>readClipperOrigin({CLIPPER_ORIGIN:value},canonical),/CLIPPER_ORIGIN/);
const call=(path='/',method='GET',host='clipper.fivegen.ai')=>clipperHostRequest({clipperOrigin,host,method,path});
assert.equal(call().path,'/clipper');
assert.equal(call('/clipper/').path,'/clipper');
for(const path of ['/clipper/campaigns','/clipper/campaigns/synthetic-campaign','/api/clipper/campaigns','/assets/main.js','/brand/fivegen-sparkle-mark.png','/fonts/inter-latin.woff2'])assert.equal(call(path).status,200,path);
for(const path of ['/clipper/app','/clipper/app/campaigns/id','/clipper/admin','/clipper/admin/campaigns','/signin','/signup','/signin-with-chatgpt','/welcome','/terms']){
  assert.equal(call(path).status,303,path);assert.equal(call(path).canonical,true);assert.equal(call(path).path,path);
}
for(const path of ['/api/clipper/campaigns','/clipper/admin','/signin','/'])assert.equal(call(path,'POST').status,405,path);
for(const path of ['/api/admin','/api/uploads/private-file','/api/auth/signin','/customer','/account','/docs','/creator/someone','/clipper/private'])assert.equal(call(path).status,404,path);
for(const path of ['/assets/../api/admin','/assets/%2e%2e/api/admin','/assets/%252e%252e/api/admin','/clipper%5cadmin','//attacker.test','/clipper%00'])assert.equal(call(path).status,400,path);
assert.equal(call('/','GET','www.fivegen.ai'),null);
assert.equal(call('/','GET','clipper.fivegen.ai.attacker.test'),null);
assert.equal(call('/','GET','attacker.test'),null);
assert.match(call('/robots.txt').text,/Disallow: \/clipper\/admin/);

// Exercise the actual middleware with only framework response construction
// stubbed, including the auth-header stripping and preserved return query.
class NextResponse extends Response{
  static next(options){return Object.assign(new NextResponse(),{kind:'next',options});}
  static rewrite(url,options){return Object.assign(new NextResponse(),{kind:'rewrite',targetUrl:url.href,options});}
  static redirect(url,options){return Object.assign(new NextResponse(null,{status:options.status,headers:options.headers}),{kind:'redirect',targetUrl:url.href});}
}
const source=readFileSync('middleware.ts','utf8').replace(/^import[\s\S]*?;\r?\n/gm,''),out={};
new Function('exports','NextResponse','readClipperOrigin','clipperHostRequest','retiredCommercePath','commerceGone',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(out,NextResponse,readClipperOrigin,clipperHostRequest,()=>false,()=>new Response(null,{status:410}));
const oldApp=process.env.APP_ORIGIN,oldClipper=process.env.CLIPPER_ORIGIN;
try{
  process.env.APP_ORIGIN=canonical;process.env.CLIPPER_ORIGIN=clipperOrigin;
  const request=(path,method='GET')=>{const url=new URL(path,clipperOrigin);url.clone=()=>new URL(url);return{method,nextUrl:url,headers:new Headers({cookie:'__Host-fivegen-session=private',authorization:'Bearer private','oai-authenticated-user-id':'spoofed','x-fivegen-app-origin':'https://attacker.test'})};};
  const home=out.middleware(request('/?lang=mn'));
  assert.equal(home.kind,'rewrite');assert.equal(home.targetUrl,clipperOrigin+'/clipper?lang=mn');
  for(const name of ['cookie','authorization','oai-authenticated-user-id'])assert.equal(home.options.request.headers.has(name),false,name);
  assert.equal(home.options.request.headers.get('x-fivegen-app-origin'),canonical);
  assert.equal(home.headers.get('Cache-Control'),'no-store');
  const member=out.middleware(request('/clipper/app?lang=mn&campaign=synthetic'));
  assert.equal(member.status,303);assert.equal(member.targetUrl,canonical+'/clipper/app?lang=mn&campaign=synthetic');
  assert.equal(out.middleware(request('/api/clipper/campaigns','POST')).status,405);
  assert.equal(out.middleware(request('/api/admin')).status,404);
}finally{
  if(oldApp===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=oldApp;
  if(oldClipper===undefined)delete process.env.CLIPPER_ORIGIN;else process.env.CLIPPER_ORIGIN=oldClipper;
}
console.log('Clipping host passed: exact trusted host, public landing/campaign/assets, canonical member/admin return paths, isolated credentials, rejected unrelated routes/mutations/traversal, validated origin configuration. No external requests.');
