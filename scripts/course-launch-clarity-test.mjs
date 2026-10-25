import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(path,deps={}){const source=readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,''),exports={};new Function('exports',...Object.keys(deps),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText)(exports,...Object.values(deps));return exports;}
const {offerView}=load('lib/offer-view.ts');
for(const model of [undefined,'one-time','subscription','pwyw'])for(const amount of [undefined,0,1,49]){const offer=offerView({amount,currency:'usd',pricing:{model,interval:'month'}});assert.equal(offer.priceSet,false);assert.equal(offer.priceText,'Price not set');assert.equal(offer.amountText,'Price not set');assert.ok(!offer.terms.includes('No payment required'));}
for(const model of ['one-time','subscription','pwyw']){const offer=offerView({amount:1900,currency:'usd',pricing:{model,interval:'month'}});assert.equal(offer.priceSet,true);assert.match(offer.priceText,/19/);assert.ok(!offer.priceText.includes('Free'));}
assert.equal(offerView({amount:0,pricing:{model:'free'}}).priceText,'Free');assert.equal(offerView({tiers:[{billing:'free',priceCents:0}]}).priceText,'Plans from Free');assert.equal(offerView({tiers:[{billing:'month',priceCents:0}]}).priceText,'Price not set');
const {builderLaunchBlockers}=load('lib/builder-launch-checklist.ts',{offerView,builderFamily:draft=>draft.family||'course'});
const draft={family:'course',priceCents:1900,currency:'usd',fields:{},studio:{}},workspace={version:7,draft,publication:{version:7},readiness:{publishReady:true,checks:[]},payments:{mode:'live',configured:true,enabled:true,connected:true,ready:true}};
const good={dirty:false,editorialApproved:true};
assert.deepEqual(builderLaunchBlockers(workspace,draft,good),[],'Ready exact-version delivery has no invented blockers');
const ids=(w=workspace,d=draft,o=good)=>builderLaunchBlockers(w,d,o).map(item=>item.id);
assert.deepEqual(ids(workspace,{...draft,priceCents:0}),['price']);
assert.deepEqual(ids({...workspace,publication:null}),['delivery']);
assert.deepEqual(ids({...workspace,publication:{version:6}}),['delivery']);
assert.deepEqual(ids(workspace,draft,{...good,dirty:true}),['save','delivery']);
assert.deepEqual(ids(workspace,draft,{...good,editorialApproved:false}),['review']);
assert.deepEqual(ids({...workspace,payments:{...workspace.payments,ready:false}}),['seller-payments']);
assert.deepEqual(ids({...workspace,payments:{...workspace.payments,configured:false}}),['platform-payments']);
const freeDraft={...draft,priceCents:0,studio:{pricing:{model:'free'}}},noMerchant={...workspace,payments:{mode:'live',configured:false,enabled:false,connected:false,ready:false}};
assert.deepEqual(ids(noMerchant,freeDraft),[],'Explicit free access does not ask for a seller payment account');
assert.deepEqual(ids({...noMerchant,payments:{...noMerchant.payments,mode:null}},freeDraft),['payment-mode'],'Free access still explains an unknown checkout environment');
const mixed={...draft,priceCents:0,studio:{community:{tiers:[{billing:'free',priceCents:0},{billing:'month',priceCents:1900}]}}};assert.deepEqual(ids(noMerchant,mixed),[],'Mixed tiers retain free-access availability while paid plan readiness is checked by checkout');
const missing={...workspace,readiness:{publishReady:false,checks:[{ready:false,message:'Add the original recording.'}]}};assert.equal(builderLaunchBlockers(missing,draft,good)[0].detail,'Add the original recording.');
const service={...draft,family:'service',fields:{meetingUrl:''}};assert.deepEqual(ids(workspace,service,{...good,sessionAvailable:false}),['meeting','availability']);const scheduled={...service,fields:{meetingUrl:'https://example.test/private'}};assert.deepEqual(ids(workspace,scheduled,{...good,sessionAvailable:true}),[]);assert.deepEqual(ids(workspace,{...service,fields:{meetingUrl:'http://example.test/private'}},{...good,sessionAvailable:true}),['meeting']);
for(const blocker of builderLaunchBlockers({...missing,publication:null,payments:noMerchant.payments},{...draft,priceCents:0},{dirty:true,editorialApproved:false})){assert.ok(blocker.action.length>4);assert.ok(['save','price','content','review','payments','delivery'].includes(blocker.repair),'Every blocker carries a concrete repair destination');}
const file=ts.createSourceFile('builder.tsx',readFileSync('app/product-builder.tsx','utf8'),ts.ScriptTarget.ES2022,true,ts.ScriptKind.TSX);let declaration;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='navigateLaunch')declaration=node;ts.forEachChild(node,visit);}visit(file);const calls=[],compiled=ts.transpileModule(declaration.getText(file),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;const navigate=new Function('repairLaunch','openPage','openAccountPayments','openMemberPreview','openBuilderPanel',compiled+';return navigateLaunch;')(value=>calls.push(['repair',value]),()=>calls.push(['page']),()=>calls.push(['payments']),()=>calls.push(['preview']),(...args)=>calls.push(['panel',...args]));
navigate('review');assert.deepEqual(calls.pop(),['panel','review'],'Editorial review is a distinct destination, not commerce');navigate('publish');assert.deepEqual(calls.pop(),['panel','details',2]);navigate('price');assert.deepEqual(calls.pop(),['repair','price']);navigate('sales-page');assert.deepEqual(calls.pop(),['page']);
console.log('Course/launch clarity passed: explicit-free pricing semantics, paid unset/invalid draft and public projections, exact-version and merchant readiness, every blocker repair, free/mixed access, service availability and distinct review/pricing routes. No external calls.');
