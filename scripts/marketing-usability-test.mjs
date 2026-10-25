import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {z} from 'zod';
const deps={z};
function load(file){const source=fs.readFileSync(file,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,''),exports={};new Function('exports',...Object.keys(deps),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,...Object.values(deps));return exports;}
for(const file of ['lib/growth.ts','lib/creator-context-contract.ts','lib/marketing-destination.ts','lib/automation.ts'])Object.assign(deps,load(file));
const facts={title:'My workshop',description:'A practice framework, without guaranteed results',format:'Video course',inclusions:['Creator lesson','Worksheet'],priceCents:4900,currency:'usd',source:'saved-product',productRevision:1,builderVersion:null};
const saved={...deps.emptyGrowthBrief(),story:'My real story',proof:'No customer proof yet',cta:'Ask a question'};
const proposed=deps.proposeGrowthBrief(saved,facts,'Independent makers');
assert.deepEqual(saved,{...deps.emptyGrowthBrief(),story:'My real story',proof:'No customer proof yet',cta:'Ask a question'},'Suggestions never mutate saved facts');
assert.equal(proposed.icp,'Independent makers');assert.equal(proposed.promise,facts.description);assert.match(proposed.offer,/Worksheet/);assert.doesNotMatch(proposed.offer,/49|USD|usd/,'Do not restate one-time or recurring commercial terms from incomplete price facts');assert.equal(proposed.story,saved.story);assert.equal(proposed.proof,saved.proof);assert.equal(proposed.cta,saved.cta);
assert.deepEqual(deps.missingGrowthAnswers(proposed),[],'Three core facts allow a useful first draft');
const minimal={...deps.emptyGrowthBrief('Creators'),promise:'Learn a repeatable process',offer:'My original lesson'};
assert.deepEqual(deps.missingGrowthAnswers(minimal),[]);assert.equal(minimal.proof,'');assert.equal(minimal.story,'');
for(const key of deps.growthStartKeys){const missing=deps.missingGrowthAnswers({...minimal,[key]:'  '});assert.deepEqual(missing.map(q=>q.key),[key]);}
const corrected={...proposed,icp:'My edited audience',promise:'My revised outcome',offer:'My own inclusions'};assert.deepEqual(deps.proposeGrowthBrief(corrected,{...facts,description:'New product description'},'Different audience'),corrected,'A source refresh must not overwrite creator answers');
const unknown=deps.proposeGrowthBrief(deps.emptyGrowthBrief(),undefined);assert.deepEqual(unknown,deps.emptyGrowthBrief(),'Unknown facts stay unknown');
const lead=deps.automationJourney('lead'),purchase=deps.automationJourney('purchase'),recovery=deps.automationJourney('checkout-recovery');
assert.match(lead.event,/consented/);assert.match(lead.exit.join(' '),/Purchase, unsubscribe or consent withdrawal/);assert.match(purchase.conditions.join(' '),/does not grant marketing permission/);assert.match(purchase.exit.join(' '),/no longer paid/);assert.match(recovery.conditions.join(' '),/one reminder every 30 days/);assert.match(recovery.exit.join(' '),/seven days/);
console.log('Marketing usability passed: three-answer brief, non-destructive editable product suggestions, honest unknowns and commercial terms, and lifecycle summaries that preserve actual consent/purchase/expiry rules.');
