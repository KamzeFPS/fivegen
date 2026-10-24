import assert from 'node:assert/strict';
import {resolve,sep} from 'node:path';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {createRequire,syncBuiltinESMExports} from 'node:module';

// Restart a rebuilt app against a known synthetic fixture. Never load dotenv.
assert.ok(!process.env.RENDER,'Local synthetic preview only.');
const root=resolve(process.argv[2]||'');
assert.ok(root.startsWith(resolve('outputs')+sep+'design-refresh-preview-'));
assert.match(readFileSync(resolve(root,'fixture-only.txt'),'utf8'),/All users, money, files and products are local fixtures/);
for(const key of Object.keys(process.env))if(/(?:TOKEN|SECRET|API_KEY|PASSWORD)|^(STRIPE_|PADDLE_|OPENAI_|ANTHROPIC_|FAL_|RESEND_|EMAIL_|GOOGLE_|NEXT_PUBLIC_|VITE_)/i.test(key))delete process.env[key];
Object.assign(process.env,{FIVEGEN_RUNTIME:'render',NODE_ENV:'production',FIVEGEN_DATA_DIR:root,APP_ORIGIN:'http://localhost:5198',PORT:'5198',ADMIN_EMAILS:'creator@example.test',FIVEGEN_FILE_SALES_ENABLED:'false',STRIPE_COMMERCE_ENABLED:'false',STRIPE_WALLET_CHECKOUT_ENABLED:'false',AUTOMATIONS_WORKER_ENABLED:'false',PURCHASE_EMAILS_WORKER_ENABLED:'false',PRODUCT_REMINDERS_WORKER_ENABLED:'false',SERVICE_INTEGRATIONS_WORKER_ENABLED:'false',STRIPE_MODE:'test',PADDLE_ENVIRONMENT:'sandbox',RENDER_EXTERNAL_URL:'',PRODUCT_DOMAIN:'',GOOGLE_CLIENT_ID:'synthetic-local-preview',GOOGLE_CLIENT_SECRET:'synthetic-local-preview',CREDENTIAL_ENCRYPTION_KEY:randomBytes(32).toString('base64url')});
const local=host=>['localhost','127.0.0.1','[::1]','::1'].includes(host);
const originalFetch=globalThis.fetch;
globalThis.fetch=(input,init)=>{assert.ok(local(new URL(typeof input==='string'||input instanceof URL?input:input.url).hostname),'External network disabled in synthetic preview.');return originalFetch(input,init);};
const require=createRequire(import.meta.url);
for(const name of ['node:http','node:https']){const module=require(name);for(const operation of ['request','get']){const original=module[operation];module[operation]=function(input,...args){const host=typeof input==='string'||input instanceof URL?new URL(input).hostname:String(input?.hostname||input?.host||'localhost').split(':')[0];assert.ok(local(host),'External network disabled in synthetic preview.');return original.call(this,input,...args);};}}
syncBuiltinESMExports();
await (await import('../runtime/render/server.mjs')).start();
