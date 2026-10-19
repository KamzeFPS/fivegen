import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import {createServer} from 'node:http';
import {createStorage} from '../runtime/render/storage.mjs';
import {digest} from '../runtime/render/auth.mjs';

// Explicit fixture-only preview. Never loads dotenv, a stored credential, an
// existing local DB, or a provider account. Test rows/files are retained.
assert.ok(!process.env.RENDER,'Local preview must not run on a deployed host');
for(const key of Object.keys(process.env))if(/^(STRIPE_|PADDLE_|OPENAI_|ANTHROPIC_|FAL_|RESEND_|EMAIL_|GOOGLE_|NEXT_PUBLIC_)/.test(key))delete process.env[key];
const fixture=process.argv.find(arg=>arg.startsWith('--fixture='))?.slice('--fixture='.length);
if(fixture)assert.match(fixture,/^file-sales-preview-\d+$/,'Only a named synthetic preview can be resumed');
const root=resolve('outputs',fixture||`file-sales-preview-${Date.now()}`);
const marker=resolve(root,'fixture-only.txt');
if(fixture)assert.equal(readFileSync(marker,'utf8'),'FiveGen synthetic file sales fixture v1\n','Refusing to open a nonfixture database');
mkdirSync(root,{recursive:true});
if(!fixture)writeFileSync(marker,'FiveGen synthetic file sales fixture v1\n');
Object.assign(process.env,{FIVEGEN_RUNTIME:'render',NODE_ENV:'production',FIVEGEN_DATA_DIR:root,APP_ORIGIN:'http://localhost:5187',PORT:'5187',FIVEGEN_FILE_SALES_ENABLED:'true',STRIPE_MODE:'test',PADDLE_ENVIRONMENT:'sandbox',RENDER_EXTERNAL_URL:'',PRODUCT_DOMAIN:'',GOOGLE_CLIENT_ID:'synthetic-local-preview',GOOGLE_CLIENT_SECRET:'synthetic-local-preview',CREDENTIAL_ENCRYPTION_KEY:randomBytes(32).toString('base64url')});
if(!process.argv.includes('--skip-build')){
 const {createBuilder}=await import('vite');
 // Bypass the Vinext CLI's dotenv loader. The same app plugin builds all RSC,
 // server and browser environments; Vite's env-file reader is explicitly off.
 await (await createBuilder({envDir:false,mode:'production'})).buildApp();
 writeFileSync('dist/fivegen-runtime.json',JSON.stringify({runtime:'render',version:1})+'\n');
}
const storage=createStorage(root),owner='file-sale-local-qa',token=randomBytes(32).toString('base64url');
storage.sqlite.prepare('INSERT INTO render_sessions VALUES (?,?,?,?,?)').run(digest(token),owner,'seller@example.test','Local seller QA',Date.now()+86400000);
// Synthetic fixture consent is never a real account acceptance.
const termsVersion=readFileSync('lib/terms.ts','utf8').match(/TERMS_VERSION='([^']+)'/)?.[1];assert.ok(termsVersion);
storage.sqlite.prepare('INSERT INTO terms_acceptances VALUES (?,?,?,?,?)').run(randomUUID(),owner,termsVersion,'seller@example.test',Date.now());
storage.close();
const {start}=await import('../runtime/render/server.mjs');await start();
const entry=createServer((req,res)=>{
 if(req.headers.host!=='localhost:5188'||req.url!=='/local-seller'){res.writeHead(404);res.end();return;}
 res.writeHead(303,{'Set-Cookie':`fivegen-local-session=${token}; Path=/; HttpOnly; SameSite=Lax`,'Location':'http://localhost:5187/sell/new','Cache-Control':'no-store'});res.end();
});
await new Promise(done=>entry.listen(5188,'127.0.0.1',done));
console.log('Synthetic seller preview: http://localhost:5188/local-seller');
console.log('Retained synthetic fixture: '+root);
console.log('Payment status is intentionally unconfigured. No provider calls or account creation are enabled.');
