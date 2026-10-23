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
  let index=0;const updates=[],initials=[];
  const iconDeps=Object.fromEntries(['ArrowLeft','ArrowRight','BarChart3','Brain','Check','ChevronDown','CircleCheck','CircleDashed','Copy','Download','FlaskConical','Layers3','Loader2','Mail','Megaphone','Plus','Puzzle','RefreshCw','Search','Sparkles','Users','Video','X'].map(name=>[name,icons[name]]));
  const deps={React,...iconDeps,useState(initial){const i=index++;initials.push(initial);return[i<values.length?values[i]:initial,value=>updates.push({index:i,value})];},useEffect(){},useRef:()=>({current:null}),useCallback:fn=>fn,useId:()=>'marketing-test',...extra};
  const source=readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,''),key='analyticsUi'+randomUUID().replaceAll('-','');
  globalThis[key]=deps;
  const code=`const {${Object.keys(deps).join(',')}}=globalThis.${key};\n`+ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText+`\n//# sourceURL=${path}\n`;
  try{return{module:await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')),updates,initials};}finally{delete globalThis[key];}
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
const report={days:30,productId:null,mode:'live',products:[{id:'unfinished-product',title:'Private unfinished workbook',published:false,visits:0,leads:0,purchases:0},{id:'published-product',title:'A published challenge',published:true,visits:3,leads:2,purchases:3}],actions:[{title:'Finish your product',reason:'Private unfinished workbook is still a draft.',label:'Open product',href:'/?project=unfinished-product&area=content'}],trendInterval:'day',trend:[
  {day:'2026-10-21',visits:1,leads:1,purchases:1,plays:0,clicks:1,bookings:0,revenue:[{currency:'usd',amount:100},{currency:'jpy',amount:0}],netEarnings:[{currency:'usd',amount:61},{currency:'jpy',amount:0}]},
  {day:'2026-10-22',visits:2,leads:1,purchases:2,plays:1,clicks:0,bookings:1,revenue:[{currency:'usd',amount:100},{currency:'jpy',amount:150}],netEarnings:[{currency:'usd',amount:0},{currency:'jpy',amount:103}]},
],salesCoverage:{legacyOrdersExcluded:0},purchases:3,revenue:[{currency:'usd',amount:200,orders:2},{currency:'jpy',amount:150,orders:1}],leads:2,visits:3,bookings:1,plays:1,clicks:1,sources:[],earnings:{totals:[{currency:'usd',creatorNetAmount:61},{currency:'jpy',creatorNetAmount:103}],coverage:{pendingOrders:1}}};
const dashboardDeps={CreatorEarnings:panel('earnings'),earningsMoney:money};
const dashboardValues=(value=report,days=value.days,currency='')=>[days,0,value,'',false,false,'','',currency];
const chartNode=(value,id)=>{const chart=nodes(value,node=>typeof node.type==='function'&&node.props?.id===id)[0];assert.ok(chart,`${id} is available in the dashboard`);return chart;};
f=await fixture('app/growth-dashboard.tsx',dashboardValues(),dashboardDeps);tree=f.module.GrowthDashboard();
const net=nodes(tree,n=>n.type==='article'&&n.props.className==='overview-metric overview-net')[0],html=renderToStaticMarkup(net);
assert.match(html,/USD\s*0\.61/);assert.match(html,/JPY\s*103/);assert.match(text(net),/1 sale awaiting fees/,'Net card uses exact confirmed settlements and makes pending coverage visible');
assert.equal(f.initials[0],0,'The dashboard initially requests the full recorded history');assert.equal(nodes(tree,n=>n.type==='h1'&&text(n)==='Dashboard').length,1);
assert.equal(nodes(tree,n=>n.type==='article'&&n.props.className?.startsWith('overview-metric')).length,3,'Sales, actual net, and confirmed orders each retain a summary and graph');assert.match(text(nodes(tree,n=>n.type==='dl'&&n.props.className==='overview-audience')[0]),/Marketing page visits3New contacts2Orders3/);
assert.match(text(tree),/A published challenge/);assert.doesNotMatch(text(tree),/Private unfinished workbook|Finish your product|Next up|Continue building your product/,'Unfinished products and their recommendations never appear, including in hidden details');
assert.equal(nodes(tree,n=>n.type==='table').length,0,'Daily activity is no longer a table');
for(const id of ['gross-sales-chart','net-earnings-chart','orders-chart','daily-activity-chart','marketing-activity-chart'])chartNode(tree,id);
assert.deepEqual(chartNode(tree,'gross-sales-chart').props.series[0].values,[100,100],'Gross graph uses the selected currency without summing unlike currencies');assert.deepEqual(chartNode(tree,'net-earnings-chart').props.series[0].values,[61,0],'Net graph uses confirmed settlements only');assert.deepEqual(chartNode(tree,'daily-activity-chart').props.series.map(series=>series.values),[[1,2],[1,1],[1,2]],'The activity graph retains actual visits, contacts, and paid-order observations');
const periodSelect=nodes(tree,n=>n.type==='select'&&n.props.id==='dashboard-period')[0];assert.equal(nodes(periodSelect,n=>n.type==='option'&&n.props.value===0&&text(n)==='All time').length,1);periodSelect.props.onChange({target:{value:'0'}});assert.ok(f.updates.some(update=>update.index===4&&update.value===true),'Changing the period hides the prior report immediately');assert.ok(f.updates.some(update=>update.index===0&&update.value===0));
const currencySelect=nodes(tree,n=>n.type==='select'&&n.props.id==='dashboard-currency')[0];assert.deepEqual(nodes(currencySelect,n=>n.type==='option').map(n=>n.props.value),['usd','jpy']);currencySelect.props.onChange({target:{value:'jpy'}});assert.ok(f.updates.some(update=>update.index===8&&update.value==='jpy'));

f=await fixture('app/growth-dashboard.tsx',[...dashboardValues(report,30,'jpy'),1,1],dashboardDeps);tree=f.module.GrowthDashboard();
const grossJpy=chartNode(tree,'gross-sales-chart'),netJpy=chartNode(tree,'net-earnings-chart');assert.deepEqual(grossJpy.props.series[0].values,[0,150]);assert.deepEqual(netJpy.props.series[0].values,[0,103]);
const grossJpyTree=grossJpy.type(grossJpy.props),grossJpyHtml=renderToStaticMarkup(grossJpyTree),netJpyHtml=renderToStaticMarkup(netJpy.type(netJpy.props));assert.match(grossJpyHtml,/role="img"/);assert.match(grossJpyHtml,/JPY\s*150/,'Inspected graph values honor a zero-decimal currency');assert.match(netJpyHtml,/JPY\s*103/);assert.doesNotMatch(grossJpyHtml,/USD|NaN|Infinity/);assert.match(grossJpyHtml,/Use the left and right arrow keys/,'Graphs expose keyboard instructions and exact values');
const graphSvg=nodes(grossJpyTree,node=>node.type==='svg')[0];let graphKeyPrevented=0;graphSvg.props.onKeyDown({key:'Home',preventDefault(){graphKeyPrevented++;}});assert.equal(f.updates.at(-1).value,0);graphSvg.props.onKeyDown({key:'End',preventDefault(){graphKeyPrevented++;}});assert.equal(f.updates.at(-1).value,1);graphSvg.props.onKeyDown({key:'Escape',preventDefault(){graphKeyPrevented++;}});assert.equal(f.updates.at(-1).value,null);assert.equal(graphKeyPrevented,3,'Keyboard inspection reaches the first/last observation and can be dismissed without scrolling the page');
const iskReport={...report,revenue:[{currency:'isk',amount:100,orders:1}],earnings:{...report.earnings,totals:[]},trend:[{...report.trend[0],revenue:[{currency:'isk',amount:100}],netEarnings:[]}]};
f=await fixture('app/growth-dashboard.tsx',[...dashboardValues(iskReport),0],dashboardDeps);tree=f.module.GrowthDashboard();const iskChart=chartNode(tree,'gross-sales-chart'),iskHtml=renderToStaticMarkup(iskChart.type(iskChart.props));assert.match(iskHtml,/ISK\s*1/,'Graph tooltips use the same Stripe minor-unit rules as financial summaries');assert.match(iskHtml,/<circle/,'A one-observation history still renders a visible data point');assert.doesNotMatch(iskHtml,/NaN|Infinity/);
const pendingReport={...report,earnings:{totals:[],coverage:{pendingOrders:3}},trend:report.trend.map(day=>({...day,netEarnings:[]}))};
f=await fixture('app/growth-dashboard.tsx',dashboardValues(pendingReport),dashboardDeps);tree=f.module.GrowthDashboard();const pendingChart=chartNode(tree,'net-earnings-chart');assert.ok(pendingChart.props.series[0].values.every(value=>value===null));assert.match(renderToStaticMarkup(pendingChart.type(pendingChart.props)),/after fee confirmation/,'Unconfirmed earnings are unavailable rather than a fabricated zero-income graph');
f=await fixture('app/growth-dashboard.tsx',dashboardValues(report,7),dashboardDeps);tree=f.module.GrowthDashboard();assert.equal(nodes(tree,n=>n.type==='article'&&n.props.className?.includes('overview-metric')).length,0,'A changed reporting period cannot display stale financial results');assert.equal(nodes(tree,n=>n.props?.id==='daily-activity-chart').length,0);
f=await fixture('app/growth-dashboard.tsx',dashboardValues(report),dashboardDeps);tree=f.module.GrowthDashboard({productId:'different-product'});assert.equal(nodes(tree,n=>n.type==='article'&&n.props.className?.includes('overview-metric')).length,0,'A changed product cannot display another product’s financial results');
const monthlyReport={...report,days:0,trendInterval:'month',trend:report.trend.map((day,index)=>({...day,day:`2026-0${index+8}-01`}))};f=await fixture('app/growth-dashboard.tsx',dashboardValues(monthlyReport),dashboardDeps);tree=f.module.GrowthDashboard();assert.match(text(tree),/Monthly activity/);assert.doesNotMatch(text(tree),/Daily activity/);assert.equal(chartNode(tree,'daily-activity-chart').props.monthly,true,'Long all-time histories are clearly labeled by their actual interval');
f=await fixture('app/growth-dashboard.tsx',dashboardValues({...report,productId:'product-one',mode:'test'}),dashboardDeps);tree=f.module.GrowthDashboard({productId:'product-one'});
assert.equal(nodes(tree,n=>n.type==='h1').length,0,'Product marketing does not add another page title below the existing product title');assert.equal(nodes(tree,n=>n.type==='h2'&&text(n)==='Sales & activity'&&n.props.className==='overview-sr-only').length,1);assert.equal(nodes(tree,n=>n.props?.className==='overview-test-notice').length,1,'The compact product report retains one explicit test-payment notice');assert.equal(nodes(tree,n=>n.props?.className==='overview-section-heading overview-results-heading').length,0,'Product performance does not repeat a second heading and date row');
const settings={admin:true,secure:true,config:{textProvider:'openai',textModel:'gpt-4.1-mini',dailyBudget:10,paused:false,emailFrom:''},connected:{openai:true,anthropic:false,fal:true,resend:false}};
const settingsExtra={ShieldCheck:icons.ShieldCheck,CheckCircle2:icons.CheckCircle2,CreditsPanel:panel('credits'),PurchaseEmailStatus:panel('purchase-email-status'),money:amount=>`$${amount/100}`,toast:{success(){}},...Object.fromEntries(['Select','SelectTrigger','SelectValue','SelectContent','SelectItem','AlertDialog','AlertDialogTrigger','AlertDialogContent','AlertDialogHeader','AlertDialogTitle','AlertDialogDescription','AlertDialogFooter','AlertDialogCancel','AlertDialogAction'].map(name=>[name,panel(name)]))};
const settingsValues=[settings,{openai:'',anthropic:'',fal:'',resend:''},false,'',{accounts:2,creditSales:1000,todayBudgetUsed:0}];
f=await fixture('app/ai-components.tsx',settingsValues,settingsExtra);tree=f.module.AIProviders({signedIn:true,onUpdate(){}});
assert.equal(nodes(tree,n=>n.type===settingsExtra.CreditsPanel).length,0,'Administrators open provider settings directly instead of scrolling through a duplicate personal credit page');
assert.equal(nodes(tree,n=>n.type===settingsExtra.PurchaseEmailStatus).length,1,'Administrator settings include purchase confirmation readiness without embedding private deliveries');
assert.equal(nodes(tree,n=>n.type==='a'&&n.props.href==='/?view=credits').length,1,'Personal credits remain one link away');
const removeButtons=nodes(tree,n=>n.type==='button'&&text(n)==='Remove stored key');assert.equal(removeButtons.length,2);assert.ok(removeButtons.every(button=>!button.props.onClick),'Removing a stored credential first opens a confirmation and never immediately calls save');
assert.equal(nodes(tree,n=>n.type===settingsExtra.AlertDialogAction&&text(n)==='Remove key & save').length,2);assert.equal(nodes(tree,n=>n.type===settingsExtra.AlertDialogCancel&&text(n)==='Keep key').length,2);
f=await fixture('app/ai-components.tsx',[settings,settingsValues[1],true,'',settingsValues[4]],settingsExtra);tree=f.module.AIProviders({signedIn:true,onUpdate(){}});assert.equal(nodes(tree,n=>n.type==='fieldset'&&n.props.disabled===true).length,1,'Inputs and key triggers cannot be changed during a settings save');
f=await fixture('app/ai-components.tsx',[{...settings,admin:false},...settingsValues.slice(1)],settingsExtra);tree=f.module.AIProviders({signedIn:true,onUpdate(){}});assert.equal(nodes(tree,n=>n.type===settingsExtra.PurchaseEmailStatus).length,0,'Non-administrators never mount the private delivery status component');
console.log('Analytics workspace UI passed: published-only dashboard, all-time graph selection, exact JPY/ISK graph values, pending-fee and stale-scope safety, scoped CRM, opt-in marketing and direct admin settings.');
