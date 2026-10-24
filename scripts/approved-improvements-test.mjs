import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
const destination=process.env.FIVEGEN_TEST_OUTPUT||'outputs/implementation-2026-10-25';
mkdirSync(destination,{recursive:true});
const scripts=[
 'product-builder-test','account-payments-test','builder-assistant-test','builder-revision-test','product-quality-test',
 'product-page-test','page-template-test','page-brand-presets-test','creator-launch-test','foundation-experience-test',
 'workspace-library-test','builder-navigation-ui-test','product-launch-resume-test','product-studio-creator-ui-test',
 'product-studio-commerce-test','product-community-tier-test','product-community-ui-test','customer-operations-test',
 'creator-refund-review-test','commerce-v2-test','customer-learning-test','customer-portal-test','customer-media-test',
 'purchase-email-status-test','creator-collaboration-test','connected-marketing-test','automation-test','voice-campaign-test',
 'growth-ai-test','growth-funnel-test','growth-strategy-test','marketing-navigation-ui-test','analytics-workspace-ui-test',
 'gen-companion-test','editor-save-registry-test','import-recovery-test','checkout-recovery-test','page-experiment-test',
 'partner-pilot-proposal-test','sales-page-ui-test','published-page-overview-test',
 'shared-public-pages-test','campaign-email-identities-test','campaign-email-ui-test','growth-plan-results-test','service-applications-test',
 'customer-context-test','customer-context-ui-test','page-copy-isolation-test','public-page-races-test','marketing-role-ui-test',
];
const results=[];
for(const name of scripts){
 const started=Date.now(),run=spawnSync(process.execPath,[`scripts/${name}.mjs`],{encoding:'utf8',timeout:120000});
 const result={name,passed:run.status===0,durationMs:Date.now()-started,output:((run.stdout||'')+(run.stderr||'')).slice(-20000)};
 results.push(result);console.log(`${result.passed?'PASS':'FAIL'} ${name}`);
 if(!result.passed)console.log(result.output.slice(-4000));
 writeFileSync(`${destination}/test-results.json`,JSON.stringify({recordedAt:new Date().toISOString(),scope:'Local synthetic service and UI regressions. No live provider verification.',passed:results.filter(item=>item.passed).length,total:results.length,results},null,2));
}
process.exitCode=results.some(result=>!result.passed)?1:0;
