import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {strToU8,strFromU8,zipSync,unzipSync} from 'fflate';
import {XMLParser,XMLValidator} from 'fast-xml-parser';

const source=readFileSync('lib/workspace-assistant-downloads.ts','utf8').replace(/^import[\s\S]*?;\r?\n/gm,''),exports={};
new Function('exports','strToU8','zipSync',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,strToU8,zipSync);
const {assistantMaterialFilename,assistantReplyMarkdown,assistantWorkflowCalendar,assistantWorkflowMaterials,assistantWorkflowSketch,assistantWorkflowZip}=exports;
const stamp=Date.UTC(2026,9,27,3,4,5),start=Date.UTC(2026,10,1,1,30),end=Date.UTC(2026,10,1,2,30);
const step=(id,action,status='pending')=>({id,title:'Review '+id,description:'Create one useful piece, then review its real content.',why:'Make the next action concrete.',needs:['Check your own examples.'],status,action});
const product=step('guide',{type:'create_product',title:'Client handoff guide',description:'A real written guide with an editable handoff email and a final-file checklist.',audience:'Independent illustrators',language:'Mongolian',format:'Guide',sections:[{title:'Эцсийн файлууд',body:'Файлуудаа нэрлэж, хэрэглэх зааврыг хамт илгээнэ үү.'},{title:'Handoff email',body:'Hi client,\nYour final artwork and agreed formats are included. Please confirm that you can open them.'}]},'completed');
product.result={resourceId:'75c00e40-acf1-4367-bf34-6a44ecae33c4',href:'/build/75c00e40-acf1-4367-bf34-6a44ecae33c4?area=content',label:'Open product',summary:'Saved a real draft.'};
const campaign=step('campaign',{type:'create_campaign',productId:null,productStepId:'guide',title:'Guide launch',goal:'Show what a useful handoff looks like.',items:[{channel:'email',title:'A clearer handoff',subject:'Your handoff checklist',body:'Confirm formats, name the files, and include clear usage instructions.'},{channel:'short_video',title:'Show the folder',subject:'',body:'Hook: Still sending final-final-v3?\nShow a clearly labeled folder.'},{channel:'social',title:'Keep it clear',subject:'',body:'A useful handoff starts with a short readme.'}]});
const calendar=step('review-time',{type:'create_calendar_event',productId:null,productStepId:'guide',title:'Review my launch draft',startAt:start,endAt:end,timezone:'America/New_York',kind:'task',notes:'Check the real drafts, then decide whether to publish.'});
const skipped=step('old-time',{...calendar.action,title:'An abandoned schedule'},'skipped');
const manual=step('feedback',{type:'manual',instructions:'Ask one real customer to read the checklist. Record their answer before revising it.'});
const workflow={id:'b5829929-c1d5-4a7e-876e-8f9db79ddb6f',title:'My first launch',summary:'A small written product and a reviewed launch plan.',assumptions:['These drafts need my review.'],steps:[product,campaign,calendar,skipped,manual]};
const originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw new Error('Downloads must not call a provider or fetch saved resources.');};
try{
 assert.equal(assistantReplyMarkdown('## A useful reply\n\nМонгол материал.',['Which audience?','Which platform?']),'## A useful reply\n\nМонгол материал.\n\n## Questions to continue\n\n1. Which audience?\n2. Which platform?\n');
 assert.equal(assistantReplyMarkdown('A freeform reply without a plan.'),'A freeform reply without a plan.\n');
 const files=assistantWorkflowMaterials(workflow,stamp),entries=unzipSync(assistantWorkflowZip(workflow,stamp));
 assert.equal(new Set(files.map(file=>file.path)).size,files.length,'Every material has a unique archive path');
 assert.deepEqual(Object.keys(entries).sort(),files.map(file=>file.path).sort());
 for(const file of files){assert.equal(strFromU8(entries[file.path]),file.content);assert.ok(file.content.trim());assert.ok(!file.path.startsWith('/')&&!file.path.split('/').includes('..')&&!file.path.includes('\\'));}
 const readme=strFromU8(entries['START-HERE.md']),plan=strFromU8(entries['workflow-plan.md']);
 assert.match(readme,/Saved workspace drafts may contain newer edits/);assert.match(readme,/does not approve a step/);assert.ok(readme.includes(product.result.href));
 assert.match(plan,/Skipped · reference only/);assert.match(plan,/Check your own examples/);assert.match(plan,/These drafts need my review/);
 const guide=files.find(file=>file.path.endsWith('/product.md')).content;
 assert.ok(guide.includes(product.action.sections[0].body));assert.ok(guide.includes(product.action.sections[1].body));assert.match(guide,/Language: Mongolian/);
 const email=files.find(file=>file.path.includes('-email-')).content,video=files.find(file=>file.path.includes('-short_video-')).content;
 assert.match(email,/Subject: Your handoff checklist/);assert.ok(email.includes(campaign.action.items[0].body));assert.ok(video.includes(campaign.action.items[1].body));
 assert.ok(files.find(file=>file.path.endsWith('/instructions.md')).content.includes(manual.action.instructions));
 assert.ok(!Object.keys(entries).some(path=>/originals|private-file|\.url$/.test(path)),'Exports do not invent or fetch private product resource files');

 const ics=strFromU8(entries['planned-schedule.ics']);
 assert.equal((ics.match(/BEGIN:VEVENT/g)||[]).length,1,'Skipped calendar proposals are excluded');
 assert.match(ics,/DTSTAMP:20261027T030405Z\r\n/);assert.match(ics,/DTSTART:20261101T013000Z\r\n/);assert.match(ics,/DTEND:20261101T023000Z\r\n/);
 assert.match(ics,/STATUS:TENTATIVE/);assert.match(ics,/TRANSP:TRANSPARENT/);assert.ok(!/ATTENDEE:|ORGANIZER:|BEGIN:VALARM|METHOD:REQUEST/.test(ics),'A plan import never invites guests or sends email');
 assert.ok(ics.replace(/\r\n /g,'').includes('Timezone: America/New_York'),'Original display timezone survives exact UTC export');
 assert.equal(assistantWorkflowCalendar({...workflow,steps:[manual,skipped]},stamp),null);
 assert.throws(()=>assistantWorkflowCalendar({...workflow,steps:[{...calendar,action:{...calendar.action,endAt:start-1}}]},stamp),/ends before/);

 const malicious='</text><script>alert("x")</script><image href="https://bad.test/x"/> & \u0000\ud800',badTitle='Review, this; then \\ that\r\nBEGIN:VEVENT\r\nATTENDEE:mailto:bad@example.com '+('Монгол үсэг '.repeat(20));
 const bad={...workflow,title:malicious,summary:malicious,steps:[{...calendar,title:malicious,description:malicious,action:{...calendar.action,title:badTitle,notes:'Backslash \\ comma, semicolon;\r\nUnicode: Монгол'}}]};
 const svg=assistantWorkflowSketch(bad);assert.equal(XMLValidator.validate(svg),true);assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script')&&!svg.includes('<image')&&!svg.includes(' href="'));assert.ok(!svg.includes('\u0000')&&!svg.includes('\ud800'));
 const parsed=new XMLParser({ignoreAttributes:false}).parse(svg);assert.equal(parsed.svg['@_width'],'960');assert.ok(Number(parsed.svg['@_height'])>0);assert.ok(parsed.svg.title['#text'].includes('</text><script>'),'Dangerous text stays text rather than becoming SVG elements');
 const injectedCalendar=assistantWorkflowCalendar(bad,stamp),unfolded=injectedCalendar.replace(/\r\n /g,'');
 assert.equal(injectedCalendar.split('\r\n').filter(line=>line==='BEGIN:VEVENT').length,1,'CRLF content cannot introduce an event');
 assert.equal(injectedCalendar.split('\r\n').filter(line=>line.startsWith('ATTENDEE:')).length,0,'CRLF content cannot introduce an attendee');
 assert.ok(unfolded.includes('Review\\, this\\; then \\\\ that\\nBEGIN:VEVENT\\nATTENDEE:mailto:bad@example.com'));
 for(const physicalLine of injectedCalendar.split('\r\n'))assert.ok(Buffer.byteLength(physicalLine,'utf8')<=75,'ICS lines fold at 75 bytes, including Unicode');
 assert.ok(!injectedCalendar.includes('�'),'Line folding does not split Unicode code points');
 assert.equal(assistantMaterialFilename('../../CON\\\u0000'),'fivegen-con');assert.equal(assistantMaterialFilename('...'),'fivegen-plan');assert.equal(assistantMaterialFilename('Миний гарын авлага'),'миний-гарын-авлага');assert.ok(Array.from(assistantMaterialFilename('a'.repeat(300))).length<=70);
 const wrongLink={...workflow,steps:[{...product,result:{...product.result,href:'//bad.test/private'}}]};assert.ok(!assistantWorkflowMaterials(wrongLink,stamp)[0].content.includes('//bad.test'));
 const pendingLink={...workflow,steps:[{...product,status:'pending'}]};assert.ok(!assistantWorkflowMaterials(pendingLink,stamp)[0].content.includes(product.result.href),'A proposal cannot pretend that a saved resource exists');
 assert.equal(assistantWorkflowSketch(workflow),assistantWorkflowSketch(structuredClone(workflow)),'The sketch is reproducible from the actual plan');
 console.log('Workspace assistant downloads passed: real product/campaign/manual content in ZIP, authorized saved-resource references, proposal and skipped-state labels, exact UTC ICS times, no invite/send actions, Unicode RFC 5545 folding, CRLF injection protection, SVG/XML injection escaping and safe unique filenames. No network/provider calls.');
}finally{globalThis.fetch=originalFetch;}
