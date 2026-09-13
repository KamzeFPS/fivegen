import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {randomBytes,randomUUID} from 'node:crypto';
import {createStorage} from '../runtime/render/storage.mjs';
import {digest} from '../runtime/render/auth.mjs';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';

// Explicit local-only QA harness. It is never used by the production start command.
assert.equal(process.env.PADDLE_ENVIRONMENT,'sandbox','Studio QA requires sandbox billing');
assert.ok(!process.env.RENDER,'Do not run local QA on a public host');
const root=resolve('outputs/studio-preview');
Object.assign(process.env,{APP_ORIGIN:'http://localhost:5184',PORT:'5184',FIVEGEN_DATA_DIR:root,FIVEGEN_RUNTIME:'render',NODE_ENV:'production',RENDER_EXTERNAL_URL:'',PRODUCT_DOMAIN:'',GOOGLE_CLIENT_ID:'local-studio-qa',GOOGLE_CLIENT_SECRET:'local-studio-qa'});
const storage=createStorage(root),token=randomBytes(32).toString('base64url'),owner='local-studio-qa';
const keyPath=resolve(root,'local-encryption.key');
if(!existsSync(keyPath))writeFileSync(keyPath,randomBytes(32).toString('base64url'),{mode:0o600});
process.env.CREDENTIAL_ENCRYPTION_KEY=readFileSync(keyPath,'utf8');
storage.sqlite.prepare('INSERT INTO render_sessions VALUES (?,?,?,?,?)').run(digest(token),owner,'studio-qa@example.test','Studio QA',Date.now()+86400000);
storage.sqlite.prepare('INSERT INTO terms_acceptances VALUES (?,?,?,?,?)').run(randomUUID(),owner,'2026-09-13-studio','studio-qa@example.test',Date.now());
storage.close();
const {start}=await import('../runtime/render/server.mjs');
await start();
const entry=createServer((req,res)=>{
  if(req.headers.host!=='localhost:5186'||req.url!=='/studio-qa'){res.writeHead(404);res.end();return;}
  res.writeHead(303,{'Set-Cookie':`fivegen-local-session=${token}; Path=/; HttpOnly; SameSite=Lax`,'Location':'http://localhost:5184/','Cache-Control':'no-store'});res.end();
});
await new Promise(done=>entry.listen(5186,'127.0.0.1',done));
console.log('Local studio preview: http://localhost:5184/');
console.log('Local QA sign-in: http://localhost:5186/studio-qa');
