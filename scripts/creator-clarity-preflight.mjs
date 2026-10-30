import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

assert.ok(!process.env.RENDER,'Run these isolated regressions locally, not on the live service.');
const suites=[
 'product-foundation-test','product-builder-test','account-payments-test','builder-assistant-test','builder-revision-test','product-quality-test',
 'product-page-test','page-template-test','page-brand-presets-test','creator-launch-test','foundation-experience-test',
 'workspace-library-test','builder-navigation-ui-test','product-launch-resume-test','product-studio-creator-ui-test',
 'product-studio-commerce-test','product-community-tier-test','product-community-ui-test','customer-operations-test',
 'creator-refund-review-test','commerce-v2-test','customer-learning-test','customer-portal-test','customer-media-test',
 'purchase-email-status-test','creator-collaboration-test','connected-marketing-test','automation-test','voice-campaign-test',
 'growth-ai-test','growth-funnel-test','growth-strategy-test','marketing-navigation-ui-test','analytics-workspace-ui-test',
 'gen-companion-test','editor-save-registry-test','import-recovery-test','checkout-recovery-test','page-experiment-test',
 'partner-pilot-proposal-test','sales-page-ui-test','published-page-overview-test','shared-public-pages-test',
 'campaign-email-identities-test','campaign-email-ui-test','growth-plan-results-test','service-applications-test',
 'customer-context-test','customer-context-ui-test','page-copy-isolation-test','public-page-races-test',
 'marketing-role-ui-test','product-deletion-test','product-deletion-ui-test',
 'product-archive-test','creator-catalog-test','relationship-automation-test','workspace-audit-usability-test',
 'workspace-example-test','builder-content-handoff-test','content-usability-test','page-editor-audit-test',
 'product-learning-test','docs-site-test','docs-host-test','catalog-host-test','automation-worker-test',
 'course-launch-clarity-test','shared-product-brief-test','workspace-clarity-test','funnel-builder-test',
 'funnel-builder-navigation-test','workspace-calendar-test','workspace-calendar-ui-test','marketing-plugins-test',
 'marketing-usability-test','gen-cloud-layout-test',
];
const env={...process.env};
for(const key of Object.keys(env))if(/TOKEN|SECRET|API_KEY|PASSWORD|^(STRIPE_|PADDLE_|OPENAI_|ANTHROPIC_|FAL_|RESEND_|EMAIL_|GOOGLE_|NEXT_PUBLIC_|VITE_)|^(FIVEGEN_DATA_DIR|APP_ORIGIN|RENDER_EXTERNAL_URL)$/.test(key))delete env[key];
const root=resolve('outputs/creator-clarity-release-2026-10-25');mkdirSync(root,{recursive:true});
const results=[];
for(const name of suites){
 const start=Date.now(),run=spawnSync(process.execPath,['scripts/'+name+'.mjs'],{env,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
 const output=(run.stdout||'')+(run.stderr||'');
 const result={name,passed:run.status===0,exitCode:run.status,signal:run.signal,durationMs:Date.now()-start,output:output.slice(-4500)};
 results.push(result);console.log(`${result.passed?'PASS':'FAIL'} ${name}`);
 if(!result.passed)console.error(output.slice(-3000));
 writeFileSync(resolve(root,'preflight-results.json'),JSON.stringify({recordedAt:new Date().toISOString(),scope:'Isolated local service and UI regressions; provider calls are fixtures, not live verification.',passed:results.filter(x=>x.passed).length,total:suites.length,complete:results.length===suites.length,results},null,2));
}
console.log(`${results.filter(x=>x.passed).length}/${suites.length} creator-clarity suites passed.`);
if(results.some(x=>!x.passed))process.exitCode=1;
