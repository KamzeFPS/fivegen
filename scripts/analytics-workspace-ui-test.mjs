import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as icons from 'lucide-react';

// Exercise actual React event handlers without a browser, database or network.
// API/auth/financial state is covered by the existing runtime suites.
async function fixture(path,values,extra={}){
  let index=0;const updates=[];
  const iconDeps=Object.fromEntries(['ArrowLeft','ArrowRight','BarChart3','Brain','Check','ChevronDown','CircleCheck','CircleDashed','Copy','Download','FlaskConical','Layers3','Loader2','Mail','Megaphone','Plus','Puzzle','RefreshCw','Search','Sparkles','Users','Video','X'].map(name=>[name,icons[name]]));
  const deps={React,...iconDeps,useState(initial){const i=index++;return[i<values.length?values[i]:initial,value=>updates.push({index:i,value})];},useEffect(){},useRef:()=>({current:null}),useCallback:fn=>fn,useId:()=>'marketing-test',...extra};
  const source=readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,''),key='analyticsUi'+randomUUID().replaceAll('-','');
  globalThis[key]=deps;
  const code=`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText+`\n//# sourceURL=${path}\n`;
  try{return{module:await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')),updates};}finally{delete globalThis[key];}
}
function nodes(tree,predicate){const result=[];function visit(n){if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(visit);return;}if(predicate(n))result.push(n);visit(n.props?.children);}visit(tree);return result;}
const text=tree=>typeof tree==='string'||typeof tree==='number'?String(tree):Array.isArray(tree)?tree.map(text).join(''):tree&&typeof tree==='object'?text(tree.props?.children):'';
const lead={id:'contact-one',name:'Ada Creator',email:'ada@example.com',productId:'product-one',productTitle:'Original workbook',status:'qualified',notes:'Asked about the workbook',source:'landing',marketing:true,consentAt:1,createdAt:1,lastSeenAt:2,updatedAt:2};
const page={leads:[lead],total:1,nextOffset:null},statuses=['new','contacted','qualified','won','lost'];
const crmValues=[page,'','',false,false,'','',null,'','new','',0];
const crmExtra={leadStatuses:statuses,leadsCsv(){throw new Error('CSV is not used by these rendering tests');}};
let f=await fixture('app/growth-crm.tsx',crmValues,crmExtra),tree=f.module.GrowthCRM();
assert.match(text(tree),/Customers & leads/);assert.match(text(tree),/1 contact/);
const search=nodes(tree,n=>n.type==='input'&&n.props.type==='search')[0];search.props.onChange({target:{value:'Ada'}});
assert.deepEqual(f.updates.slice(-2),[{index:3,value:true},{index:1,value:'Ada'}],'Changing search immediately hides the old result set while the scoped request loads');
const status=nodes(tree,n=>n.type==='select'&&n.props['aria-label']==='Filter contacts by status')[0];status.props.onChange({target:{value:'qualified'}});
assert.deepEqual(f.updates.slice(-2),[{index:3,value:true},{index:2,value:'qualified'}]);
const contact=nodes(tree,n=>n.type==='button'&&n.props['aria-label']?.startsWith('Open contact'))[0];await contact.props.onClick();
assert.ok(f.updates.some(u=>u.index===7&&u.value===lead));assert.ok(f.updates.some(u=>u.index===8&&u.value===lead.notes),'Opening a contact retains its existing notes');
assert.match(text(contact),/Ada Creator/);assert.match(text(contact),/Original workbook/);assert.match(text(contact),/Qualified/);assert.equal(nodes(tree,n=>n.type==='table').length,0,'The same full-row contact control works on phones without a horizontally scrolling desktop table');
assert.equal(contact.props['aria-label'],'Open contact Ada Creator, ada@example.com');
const descriptions=contact.props['aria-describedby'].split(' ').map(id=>nodes(contact,node=>node.props?.id===id)[0]);
assert.equal(descriptions.length,3);assert.ok(descriptions.every(Boolean),'Every contact description ID resolves to that row’s own metadata');assert.deepEqual(descriptions.slice(0,2).map(text),['Product: Original workbook','Status: Qualified']);assert.match(text(descriptions[2]),/^Signed up: /,'The signup date remains available to screen readers as well as sighted users');
f=await fixture('app/growth-crm.tsx',[page,'Ada','qualified',false,false,'','',null,'','new','',0],crmExtra);tree=f.module.GrowthCRM();
nodes(tree,n=>n.type==='button'&&text(n)==='Clear filters')[0].props.onClick();assert.deepEqual(f.updates,[{index:3,value:true},{index:1,value:''},{index:2,value:''}]);
f=await fixture('app/growth-crm.tsx',[page,'Different search','',true,false,'','',null,'','new','',0],crmExtra);tree=f.module.GrowthCRM();assert.equal(nodes(tree,n=>n.type==='button'&&n.props['aria-label']?.startsWith('Open contact')).length,0,'Stale contacts are not shown as matching a new filter');assert.match(text(tree),/Loading contacts/);
f=await fixture('app/growth-crm.tsx',[page,'','',false,false,'','',lead,'Unsaved private note','qualified','',0],crmExtra);tree=f.module.GrowthCRM();
const previousWindow=globalThis.window;globalThis.window={confirm:()=>false};try{nodes(tree,n=>n.type==='button'&&n.props['aria-label']==='Close lead details')[0].props.onClick();nodes(tree,n=>n.type==='button'&&text(n)==='Back to contacts')[0].props.onClick();assert.equal(f.updates.length,0,'Both close and phone back navigation preserve unsaved private notes when discard is declined');}finally{globalThis.window=previousWindow;}
f=await fixture('app/growth-crm.tsx',[page,'Ada','qualified',false,false,'','',lead,lead.notes,'qualified','',0],crmExtra);tree=f.module.GrowthCRM();nodes(tree,n=>n.type==='button'&&text(n)==='Back to contacts')[0].props.onClick();assert.deepEqual(f.updates,[{index:7,value:null}],'Returning to contacts clears only selection, preserving search/status filters');
const effects=[],refs=[],focusCalls=[],scrollCalls=[];
f=await fixture('app/growth-crm.tsx',[page,'','',false,false,'','',lead,lead.notes,'qualified','',0],{...crmExtra,useEffect:callback=>effects.push(callback),useRef:initial=>{const ref={current:initial};refs.push(ref);return ref;}});tree=f.module.GrowthCRM();
refs[0].current={focus:options=>focusCalls.push(options)};refs[1].current={scrollIntoView:options=>scrollCalls.push(options)};
globalThis.window={matchMedia:query=>({matches:query==='(max-width:900px)'})};try{effects[2]();assert.deepEqual(focusCalls,[{preventScroll:true}]);assert.deepEqual(scrollCalls,[{block:'start',behavior:'smooth'}],'Phone detail navigation scrolls its Back control into view, independently of heading focus');}finally{globalThis.window=previousWindow;}

const panel=name=>()=>React.createElement('div',{'data-panel':name});
const marketingExtra={Dialog:panel('dialog'),DialogContent:panel('dialog-content'),DialogHeader:panel('dialog-header'),DialogTitle:panel('dialog-title'),DialogDescription:panel('dialog-description'),GrowthDashboard:panel('sales'),GrowthVSL:panel('vsl'),GrowthFunnelPanel:panel('funnel'),CreatorVoiceLibrary:panel('voice'),CampaignStudio:panel('campaigns'),AutomationStudio:panel('automations'),OfferLab:panel('offer')};
const marketingValues=[{installed:[],updatedAt:0},false,'',0,false,'','','',null,false,false],changed=[];
const props={product:{id:'product-one'},tab:'vsl',aiReady:false,cost:1,unlimited:false,onTab:id=>changed.push(id),onResolveTab(){},onUpdate(){},onDirtyChange(){},onBusyChange(){}};
f=await fixture('app/marketing-workspace.tsx',marketingValues,marketingExtra);tree=f.module.MarketingWorkspace(props);
assert.deepEqual(nodes(tree,n=>n.props?.role==='tab').map(text),['Sales'],'A deep link does not install optional plugins; Sales is the only default marketing tab');
assert.equal(nodes(tree,n=>n.type===marketingExtra.GrowthVSL).length,0);assert.equal(nodes(tree,n=>n.type===marketingExtra.GrowthDashboard).length,1);assert.equal(nodes(tree,n=>n.props?.role==='tab'&&/CRM|Customers/.test(text(n))).length,0);
assert.equal(nodes(tree,n=>n.type==='button'&&text(n).startsWith('Add tools')).length,1);assert.equal(nodes(tree,n=>n.type==='button'&&text(n)==='Explore plugins').length,0,'Marketing exposes one tool-manager entry instead of duplicate promotion boxes');
f=await fixture('app/marketing-workspace.tsx',[{installed:['vsl','funnel'],updatedAt:1},...marketingValues.slice(1)],marketingExtra);tree=f.module.MarketingWorkspace({...props,tab:'dashboard'});
assert.deepEqual(nodes(tree,n=>n.props?.role==='tab').map(text),['Sales','VSL','Funnel']);
let focused=false;nodes(tree,n=>n.props?.role==='tablist')[0].props.onKeyDown({key:'End',preventDefault(){},currentTarget:{querySelectorAll:()=>[{focus(){}},{focus(){}},{focus(){focused=true;}}]}});assert.equal(changed.at(-1),'funnel');assert.equal(focused,true,'Installed tool navigation keeps keyboard selection and focus together');

const earnings=await fixture('app/creator-earnings.tsx',[],{}),money=earnings.module.earningsMoney;
const report={days:30,productId:null,mode:'live',products:[],actions:[],trend:[],salesCoverage:{legacyOrdersExcluded:0},purchases:1,revenue:[{currency:'usd',amount:100,orders:1},{currency:'jpy',amount:150,orders:1}],leads:2,visits:3,bookings:0,plays:0,clicks:0,sources:[],earnings:{totals:[{currency:'usd',creatorNetAmount:61},{currency:'jpy',creatorNetAmount:103}],coverage:{pendingOrders:1}}};
const dashboardDeps={CreatorEarnings:panel('earnings'),earningsMoney:money};
f=await fixture('app/growth-dashboard.tsx',[30,0,report,'',false,false,'',''],dashboardDeps);tree=f.module.GrowthDashboard();
const net=nodes(tree,n=>n.type==='article'&&n.props.className==='overview-metric overview-net')[0],html=renderToStaticMarkup(net);
assert.match(html,/USD\s*0\.61/);assert.match(html,/JPY\s*103/);assert.match(text(net),/1 sale awaiting fees/,'Net card uses exact confirmed settlements and makes pending coverage visible');
assert.equal(nodes(tree,n=>n.type==='article'&&n.props.className?.startsWith('overview-metric')).length,3,'Only sales, actual net, and confirmed orders are primary metrics');assert.match(text(nodes(tree,n=>n.type==='dl'&&n.props.className==='overview-audience')[0]),/New contacts2Marketing page visits3/,'Audience metrics stay available without two additional large cards');
f=await fixture('app/growth-dashboard.tsx',[7,0,report,'',false,false,'',''],dashboardDeps);tree=f.module.GrowthDashboard();assert.equal(nodes(tree,n=>n.type==='article'&&n.props.className?.includes('overview-metric')).length,0,'A changed reporting period cannot display stale financial results');
f=await fixture('app/growth-dashboard.tsx',[30,0,{...report,productId:'product-one',mode:'test'},'',false,false,'',''],dashboardDeps);tree=f.module.GrowthDashboard({productId:'product-one'});
assert.equal(nodes(tree,n=>n.type==='h1').length,0,'Product marketing does not add another page title below the existing product title');assert.equal(nodes(tree,n=>n.type==='h2'&&text(n)==='Sales & activity'&&n.props.className==='overview-sr-only').length,1);assert.equal(nodes(tree,n=>n.props?.className==='overview-test-notice').length,1,'The compact product report retains one explicit test-payment notice');assert.equal(nodes(tree,n=>n.props?.className==='overview-section-heading overview-results-heading').length,0,'Product performance does not repeat a second heading and date row');
const settings={admin:true,secure:true,config:{textProvider:'openai',textModel:'gpt-4.1-mini',dailyBudget:10,paused:false,emailFrom:''},connected:{openai:true,anthropic:false,fal:true,resend:false}};
const settingsExtra={ShieldCheck:icons.ShieldCheck,CheckCircle2:icons.CheckCircle2,CreditsPanel:panel('credits'),money:amount=>`$${amount/100}`,toast:{success(){}},...Object.fromEntries(['Select','SelectTrigger','SelectValue','SelectContent','SelectItem','AlertDialog','AlertDialogTrigger','AlertDialogContent','AlertDialogHeader','AlertDialogTitle','AlertDialogDescription','AlertDialogFooter','AlertDialogCancel','AlertDialogAction'].map(name=>[name,panel(name)]))};
const settingsValues=[settings,{openai:'',anthropic:'',fal:'',resend:''},false,'',{accounts:2,creditSales:1000,todayBudgetUsed:0}];
f=await fixture('app/ai-components.tsx',settingsValues,settingsExtra);tree=f.module.AIProviders({signedIn:true,onUpdate(){}});
assert.equal(nodes(tree,n=>n.type===settingsExtra.CreditsPanel).length,0,'Administrators open provider settings directly instead of scrolling through a duplicate personal credit page');
assert.equal(nodes(tree,n=>n.type==='a'&&n.props.href==='/?view=credits').length,1,'Personal credits remain one link away');
const removeButtons=nodes(tree,n=>n.type==='button'&&text(n)==='Remove stored key');assert.equal(removeButtons.length,2);assert.ok(removeButtons.every(button=>!button.props.onClick),'Removing a stored credential first opens a confirmation and never immediately calls save');
assert.equal(nodes(tree,n=>n.type===settingsExtra.AlertDialogAction&&text(n)==='Remove key & save').length,2);assert.equal(nodes(tree,n=>n.type===settingsExtra.AlertDialogCancel&&text(n)==='Keep key').length,2);
f=await fixture('app/ai-components.tsx',[settings,settingsValues[1],true,'',settingsValues[4]],settingsExtra);tree=f.module.AIProviders({signedIn:true,onUpdate(){}});assert.equal(nodes(tree,n=>n.type==='fieldset'&&n.props.disabled===true).length,1,'Inputs and key triggers cannot be changed during a settings save');
console.log('Analytics workspace UI passed: scoped CRM filtering and preserved notes, opt-in marketing/keyboard tabs, exact multi-currency net, stale-period protection, direct admin settings and explicit credential-removal confirmation.');
