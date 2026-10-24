import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

const fixtureErrorGuard=Symbol.for('fivegen.fixture.safe-errors');
if(!globalThis[fixtureErrorGuard]){globalThis[fixtureErrorGuard]=true;process.on('uncaughtException',error=>{console.error(String(error.stack||error).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'[fixture module]'));process.exitCode=1;});}

// The production modules have a deliberate commerce/learning dependency cycle.
// Import-stripping tests need live forwarders rather than no-op replacements.
export function prepareStudioFixtureRuntime(deps){
  const runtime={};
  for(const name of ['communityTierAllows','communityTierDelivery','selectedCommunityTier','assertCommunityTierEntitlement','builderPublishedDelivery','builderOrderDelivery','verifyBuilderDelivery','builderDownloadMetadata','builderPrivateDownload','builderBuyerCover','builderPrivateCover','builderBuyerDelivery','assertServiceIntegrationReady','fulfillStudioSession','studioSubscriptionEvent','assertStudioSubscriptionAccess','revokeStudioEntitlements','teamSeatAllows','teamSeatOrderIds','sectionHasContent','learningDeliverySections','learnerSectionAccess'])deps[name]=(...args)=>{if(typeof runtime[name]!=='function')throw new Error(`Fixture dependency ${name} has not loaded`);return runtime[name](...args);};
  return async load=>{for(const path of ['lib/product-curriculum.ts','lib/product-decision-contract.ts','lib/product-community-tier-contract.ts','lib/product-community-tiers.ts','lib/product-studio-contract.ts','lib/service-integrations-crypto.ts','lib/service-integrations-oauth.ts','lib/service-integrations-server.ts','lib/product-readiness.ts','lib/builder-delivery-server.ts','lib/product-team-server.ts','lib/product-learning-server.ts','lib/product-service-fulfillment.ts','lib/product-studio-commerce.ts']){const loaded=await load(path);Object.assign(runtime,loaded);Object.assign(deps,loaded);}};
}
export function moduleFixtureDependencies(source,deps){
  const parsed=ts.createSourceFile('fixture.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),declared=new Set();
  const bind=name=>{if(ts.isIdentifier(name))declared.add(name.text);else if(ts.isObjectBindingPattern(name)||ts.isArrayBindingPattern(name))for(const item of name.elements)if(ts.isBindingElement(item))bind(item.name);};
  for(const node of parsed.statements){if(ts.isFunctionDeclaration(node)||ts.isClassDeclaration(node)){if(node.name)declared.add(node.name.text);}else if(ts.isVariableStatement(node))for(const item of node.declarationList.declarations)bind(item.name);}
  return Object.fromEntries(Object.entries(deps).filter(([name])=>!declared.has(name)));
}
export async function loadStudioMarkdownFixture(){
  async function load(path,deps){const source=readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,''),key='studioMarkdownFixture'+randomUUID().replaceAll('-','');globalThis[key]=moduleFixtureDependencies(source,deps);const code=`const {${Object.keys(globalThis[key]).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;try{return await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));}finally{delete globalThis[key];}}
  return load('lib/product-studio-markdown.ts',await load('lib/export.ts',{}));
}
