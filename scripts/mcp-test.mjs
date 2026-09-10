import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const base='http://localhost:5173',db=new DatabaseSync('.wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite');
const hash=v=>createHash('sha256').update(v).digest('base64url');
let clientId,productId,foreignId,client,connectionId;
const marker='MCP TEST '+randomUUID().slice(0,8),requests=[];
async function json(path,method='GET',body,headers={}){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});const d=await r.json();return {r,d};}
try{
  let r=await fetch(base+'/api/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,401);assert.ok(r.headers.get('www-authenticate').includes('oauth-protected-resource'));
  const metadata=await json('/.well-known/oauth-authorization-server');assert.equal(metadata.d.issuer,base);assert.deepEqual(metadata.d.code_challenge_methods_supported,['S256']);
  assert.equal((await json('/oauth/register','POST',{redirect_uris:['https://example.com/callback#fragment']})).r.status,400);
  const registration=await json('/oauth/register','POST',{client_name:marker,redirect_uris:['http://127.0.0.1:9432/callback'],token_endpoint_auth_method:'none'});assert.equal(registration.r.status,201);clientId=registration.d.client_id;
  const login=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'}),cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
  const verifier=hash(randomUUID())+hash(randomUUID()),query=new URLSearchParams({client_id:clientId,redirect_uri:'http://127.0.0.1:9432/callback',response_type:'code',code_challenge:hash(verifier),code_challenge_method:'S256',state:randomUUID(),resource:base+'/api/mcp',scope:'products:read products:write ai:generate products:publish'});
  const consentPage=await fetch(base+'/oauth/authorize?'+query,{headers:{cookie}}),html=await consentPage.text();assert.equal(consentPage.status,200);const ticket=html.match(/name="ticket" value="([^"]+)"/)?.[1];assert.ok(ticket,'Consent page must contain signed authorization ticket');
  const consent=new URLSearchParams({ticket,decision:'allow'});for(const scope of query.get('scope').split(' '))consent.append('scope',scope);
  assert.equal((await fetch(base+'/oauth/consent',{method:'POST',headers:{cookie,origin:'https://evil.example','Content-Type':'application/x-www-form-urlencoded'},body:consent,redirect:'manual'})).status,403);
  const granted=await fetch(base+'/oauth/consent',{method:'POST',headers:{cookie,origin:base,'Content-Type':'application/x-www-form-urlencoded'},body:consent,redirect:'manual'});assert.equal(granted.status,303);const callback=new URL(granted.headers.get('location'));assert.equal(callback.searchParams.get('state'),query.get('state'));assert.equal(callback.searchParams.get('iss'),base);
  const tokenBody=new URLSearchParams({grant_type:'authorization_code',client_id:clientId,resource:base+'/api/mcp',redirect_uri:query.get('redirect_uri'),code:callback.searchParams.get('code'),code_verifier:verifier});
  async function token(body){const r=await fetch(base+'/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});return {r,d:await r.json()};}
  const bad=new URLSearchParams(tokenBody);bad.set('code_verifier','x'.repeat(50));assert.equal((await token(bad)).r.status,400);
  const authorized=await token(tokenBody);assert.equal(authorized.r.status,200);assert.equal((await token(tokenBody)).r.status,400,'One-use authorization code');
  const credentials=authorized.d;connectionId=db.prepare('SELECT id FROM mcp_connections WHERE client_id=?').get(clientId).id;
  assert.equal(db.prepare('SELECT access_hash FROM mcp_connections WHERE id=?').get(connectionId).access_hash,hash(credentials.access_token));
  client=new Client({name:'fivegen-integration-test',version:'1.0.0'});await client.connect(new StreamableHTTPClientTransport(new URL(base+'/api/mcp'),{requestInit:{headers:{Authorization:'Bearer '+credentials.access_token}}}));
  const tools=await client.listTools();assert.equal(tools.tools.length,14);assert.ok(!JSON.stringify(tools).includes('admin_settings'));
  async function call(name,args={},error=false){const output=await client.callTool({name,arguments:args});assert.equal(!!output.isError,error,JSON.stringify(output));return output.structuredContent||JSON.parse(output.content[0].text);}
  const info=await call('get_workspace');assert.equal(info.plan.tier,'free');assert.equal(info.plan.commissionPercent,10);assert.equal(info.costs.image,12);
  const createArgs={title:marker,description:'A useful product for testing the complete connected assistant journey.',audience:'Independent creators',format:'Guide',price:19,color:'orange',requestId:randomUUID()};requests.push(createArgs.requestId);
  const created=await call('create_product',createArgs);productId=created.product.id;assert.equal(created.product.status,'draft');assert.equal((await call('create_product',createArgs)).product.id,productId);await call('create_product',{...createArgs,title:marker+' modified'},true);
  let p=(await call('get_product',{productId})).product;
  const saveArgs={productId,expectedUpdatedAt:p.updatedAt,requestId:randomUUID(),changes:{content:{sections:[{title:'A real first chapter',body:'Choose one service and define a measurable result for your first client.'}],benefits:['A focused first offer'],launch:'Introduce the finished guide to your audience.',files:[{name:'pricing.csv',content:'Service,Price\nDesign,250',description:'Simple pricing worksheet'}]}}};
  await call('save_product',saveArgs);assert.equal((await call('get_product',{productId})).product.content.sections[0].title,'A real first chapter');await call('save_product',{...saveArgs,requestId:randomUUID()},true);
  p=(await call('get_product',{productId})).product;await call('save_product',{productId,expectedUpdatedAt:p.updatedAt,requestId:randomUUID(),changes:{commerce:{billing:'month'}}},true);
  const published=await call('set_product_visibility',{productId,expectedUpdatedAt:p.updatedAt,status:'published',confirm:true,requestId:randomUUID()});assert.equal(published.product.url,base+'/p/'+p.slug);
  const page=await fetch(published.product.url);assert.equal(page.status,200);assert.ok((await page.text()).includes(marker));
  const links=await call('get_download_links',{productId});assert.equal(links.files[0].name,'pricing.csv');assert.equal(links.requiresBrowserSignIn,true);
  foreignId=randomUUID();db.prepare('INSERT INTO products (id,owner,slug,title,description,audience,format,price,color,content,status,created_at,updated_at) SELECT ?,?, ?,title,description,audience,format,price,color,content,status,created_at,updated_at FROM products WHERE id=?').run(foreignId,'foreign-mcp-test','foreign-'+foreignId,productId);
  assert.equal((await call('get_product',{productId:foreignId},true)).status,404);
  db.prepare("UPDATE mcp_connections SET scopes='products:read' WHERE id=?").run(connectionId);
  assert.equal((await call('create_product',{...createArgs,requestId:randomUUID()},true)).status,403);assert.equal((await call('generate_marketing_asset',{productId,kind:'image',name:'Test',prompt:'A professional cover for the product',requestId:randomUUID(),maxCredits:12,confirmSpend:true},true)).status,403);
  assert.equal((await fetch(base+'/api/mcp',{method:'POST',headers:{Authorization:'Bearer '+credentials.access_token,origin:'https://evil.example','Content-Type':'application/json'},body:'{}'})).status,403);
  const refreshBody=new URLSearchParams({grant_type:'refresh_token',client_id:clientId,resource:base+'/api/mcp',refresh_token:credentials.refresh_token});const fresh=await token(refreshBody);assert.equal(fresh.r.status,200);assert.equal((await token(refreshBody)).r.status,400);
  assert.equal((await fetch(base+'/api/mcp',{method:'POST',headers:{Authorization:'Bearer '+credentials.access_token,'Content-Type':'application/json'},body:'{}'})).status,401);
  const revoke=await json('/api/connections','DELETE',{id:connectionId},{cookie,origin:base});assert.equal(revoke.r.status,200);
  assert.equal((await fetch(base+'/api/mcp',{method:'POST',headers:{Authorization:'Bearer '+fresh.d.access_token,'Content-Type':'application/json'},body:'{}'})).status,401);
  console.log('Passed: real MCP SDK discovery/calls; complete OAuth PKCE + consent + rotation + revocation; product creation/editing/publishing/readback; ownership; scope and Pro gates; retry deduplication; stale edit protection; no paid provider requests.');
}finally{
  await client?.close();
  if(clientId){db.prepare('DELETE FROM mcp_calls WHERE connection_id IN (SELECT id FROM mcp_connections WHERE client_id=?)').run(clientId);db.prepare('DELETE FROM mcp_codes WHERE client_id=?').run(clientId);db.prepare('DELETE FROM mcp_connections WHERE client_id=?').run(clientId);db.prepare('DELETE FROM mcp_clients WHERE id=?').run(clientId);}
  for(const value of [productId,foreignId].filter(Boolean)){db.prepare('DELETE FROM generation WHERE product_id=?').run(value);db.prepare('DELETE FROM visits WHERE product_id=?').run(value);db.prepare('DELETE FROM products WHERE id=?').run(value);}
  db.close();
}
