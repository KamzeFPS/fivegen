import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import ts from 'typescript';
import {z} from 'zod';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createStorage} from '../runtime/render/storage.mjs';

function load(path,deps={}){
 const source=readFileSync(path,'utf8').replace(/^import[^\n]*\n/gm,'');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
 const exports={};new Function('exports',...Object.keys(deps),code)(exports,...Object.values(deps));return exports;
}
const product=load('lib/product.ts',{z}),builder=load('lib/builder-contract.ts',{z,sectionSchema:product.sectionSchema,fileSchema:product.fileSchema});
const helpers=load('lib/workspace-library.ts');
assert.equal(helpers.initialWorkspaceView(true,new URLSearchParams()),'overview','A signed-in workspace opens its dashboard by default');
assert.equal(helpers.initialWorkspaceView(false,new URLSearchParams()),'create','Visitors can still discover how product creation works');
for(const path of ['view=create','conversation=saved-plan','project=saved-product'])assert.equal(helpers.initialWorkspaceView(true,new URLSearchParams(path)),'create','Existing creation and recovery intents take priority over the dashboard');
assert.equal(helpers.initialWorkspaceView(true,new URLSearchParams('billing=returned')),'credits');
assert.equal(helpers.initialWorkspaceView(true,new URLSearchParams('connect=mcp')),'connections');
const studioSource=ts.createSourceFile('generator-studio.tsx',readFileSync('app/generator-studio.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let changeViewSource,buildFromIdeaSource;
function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='changeView')changeViewSource=node.getText(studioSource);if(ts.isFunctionDeclaration(node)&&node.name?.text==='buildFromIdea')buildFromIdeaSource=node.getText(studioSource);ts.forEachChild(node,visit);}visit(studioSource);assert.ok(changeViewSource);assert.ok(buildFromIdeaSource);
const scrolls=[],destinations=[],views=[],viewCode=ts.transpileModule(changeViewSource,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const changeView=new Function('navigate','setError','setView','setProduct','window',viewCode+';return changeView;')(action=>action(),()=>{},value=>views.push(value),()=>{},{history:{replaceState:(_state,_unused,path)=>destinations.push(path)},scrollTo:options=>scrolls.push(options)});
changeView('library');assert.equal(views.at(-1),'library');assert.equal(destinations.at(-1),'/?view=library');assert.deepEqual(scrolls.at(-1),{top:0,left:0,behavior:'instant'},'Changing workspace sections resets the previous page scroll instead of hiding its heading');
const draftWrites=[],creationRoutes=[],idea='A practical workbook for first-time freelancers';
const startAI=new Function('sessionStorage','message','leaveWorkspace',ts.transpileModule(buildFromIdeaSource,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText+';return buildFromIdea;')({setItem:(...args)=>draftWrites.push(args)},idea,path=>creationRoutes.push(path));startAI();assert.deepEqual(draftWrites,[['fivegen:builder-new-idea',idea]]);assert.deepEqual(creationRoutes,['/build/new?source=ai'],'The streamlined idea form preserves the complete draft and original AI pipeline');
const products=product.formats.map((format,index)=>({id:randomUUID(),slug:'fixture-'+index,title:index===0?'A clear first book':`Specific ${format}`,description:'Original useful content for a defined audience',audience:'Independent creators',format,color:'orange',price:19,status:'draft',content:{sections:[{title:'One',body:'Original text'}],benefits:[],launch:''},createdAt:index,updatedAt:index}));
const summaries=products.map(item=>({productId:item.id,type:builder.builderTypeForFormat(item.format),unitCount:1,uploadCount:0,pagePublished:false}));
summaries[0].pagePublished=true;
assert.equal(helpers.workspaceProductPublished(products[0],summaries),true,'A live publication remains published even if the current builder product row is a draft');
assert.equal(helpers.selectWorkspaceProducts(products,{status:'published',builders:summaries}).length,1);
assert.equal(helpers.selectWorkspaceProducts(products,{status:'draft',builders:summaries}).length,10);
assert.equal(helpers.selectWorkspaceProducts(products,{query:'  FIRST BOOK  ',builders:summaries})[0].id,products[0].id,'Search trims and ignores case');
assert.equal(helpers.selectWorkspaceProducts(products,{query:'defined audience',builders:summaries}).length,11,'The product promise is searchable as well as its title');
assert.deepEqual(helpers.selectWorkspaceProducts(products,{format:'Book',status:'published',builders:summaries}).map(item=>item.id),[products[0].id]);
assert.equal(helpers.selectWorkspaceProducts(products,{format:'Book',status:'draft',builders:summaries}).length,0,'Status and product-type filters combine');
assert.equal(helpers.selectWorkspaceProducts(products)[0].id,products.at(-1).id,'Recently edited products appear first');
assert.equal(products[0].format,'Book','Display sorting does not mutate the workspace source');
const alphabetical=helpers.selectWorkspaceProducts(products,{sort:'title'});assert.equal(alphabetical[0].id,products[0].id);
for(const item of products)assert.equal(helpers.workspaceProductDestination(item,summaries),'/build/'+item.id,`${item.format} opens its own builder`);
assert.equal(helpers.workspaceProductDestination(products[0],[],[{productId:products[0].id}]),'/sell/'+products[0].id,'Existing file-sale products retain their dedicated editor');
assert.equal(helpers.workspaceProductDestination(products[0]),null,'Legacy products keep their existing in-workspace editor');
assert.equal(helpers.workspaceProductPublished(products[0],[],[{productId:products[0].id,pagePublished:true}]),true);

const icon=()=>React.createElement('svg'),icons=Object.fromEntries(['ArrowRight','Banknote','BookOpen','CalendarDays','ChevronDown','ChevronRight','Coins','CreditCard','FileText','FolderOpen','GraduationCap','History','LayoutGrid','Layers3','Link2','List','LogOut','Menu','MessageSquare','Plus','Search','ShieldCheck','SlidersHorizontal','TrendingUp','Upload','Users','X'].map(key=>[key,icon]));
const passthrough=({children})=>React.createElement('div',null,children),menus=Object.fromEntries(['DropdownMenu','DropdownMenuContent','DropdownMenuItem','DropdownMenuLabel','DropdownMenuSeparator','DropdownMenuTrigger','Popover','PopoverContent','PopoverTrigger'].map(name=>[name,passthrough]));
const ui=load('app/workspace-product-library.tsx',{React,useState:React.useState,...icons,...menus,...helpers,builderTypeDetails:builder.builderTypeDetails});
const html=renderToStaticMarkup(React.createElement(ui.WorkspaceProductLibrary,{products,builders:summaries,onOpen:()=>{},onCreateFrom:()=>{}}));
assert.match(html,/aria-label="Search products"/);assert.match(html,/aria-label="Product type"/);assert.match(html,/aria-label="Sort products"/);assert.match(html,/<button[^>]*aria-label="Grid view"[^>]*aria-pressed="true"/);
assert.equal((html.match(/class="library-product"/g)||[]).length,11,'Every supported product type remains available');
assert.match(html,/Upload existing content/);assert.match(html,/Start manually/);assert.doesNotMatch(html,/cover-art|eclipse/i,'Fallback cards do not reuse the same decorative hero image');
for(const item of products)assert.ok(html.includes('href="/build/'+item.id+'"'),`${item.format} exposes a real link for opening in another tab`);
const existingFile=renderToStaticMarkup(React.createElement(ui.WorkspaceProductLibrary,{products:[products[0]],files:[{productId:products[0].id}],onOpen:()=>{},onCreateFrom:()=>{}}));assert.ok(existingFile.includes('href="/sell/'+products[0].id+'"'));
const legacy=renderToStaticMarkup(React.createElement(ui.WorkspaceProductLibrary,{products:[products[0]],onOpen:()=>{},onCreateFrom:()=>{}}));assert.ok(legacy.includes('href="/?project='+products[0].id+'&amp;area=content"'));
for(const modifiers of [{},{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true},{button:1},{button:2},{defaultPrevented:true}]){
 let prevented=0,opened=0;const event={button:0,ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,defaultPrevented:false,...modifiers,preventDefault(){prevented++;}};
 ui.openWorkspaceProductLink(event,products[0],value=>{assert.equal(value.id,products[0].id);opened++;});const ordinary=!Object.keys(modifiers).length;
 assert.equal(opened,ordinary?1:0,'Only an ordinary primary click invokes the guarded workspace navigation');assert.equal(prevented,ordinary?1:0,'Modified and middle clicks preserve native browser behavior');
}
const libraryAst=ts.createSourceFile('workspace-product-library.tsx',readFileSync('app/workspace-product-library.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),sourceMenuItems=[];
function visitLibrary(node){if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(libraryAst)==='DropdownMenuItem'&&/onCreateFrom/.test(node.getText(libraryAst)))sourceMenuItems.push(node.getText(libraryAst));ts.forEachChild(node,visitLibrary);}visitLibrary(libraryAst);assert.equal(sourceMenuItems.length,2);
const choices=[],sourceMenuCode=ts.transpileModule('const choices=['+sourceMenuItems.join(',')+'];',{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022}}).outputText;
const actualChoices=new Function('React','DropdownMenuItem','Upload','FileText','onCreateFrom',sourceMenuCode+';return choices;')(React,passthrough,icon,icon,source=>choices.push(source));actualChoices.forEach(choice=>choice.props.onSelect());assert.deepEqual(choices,['upload','manual'],'The compact source menu retains both original creation routes');
const nav=load('app/workspace-navigation.tsx',{React,...icons,...menus,Brand:()=>React.createElement('span',null,'FiveGen')});
const navHtml=renderToStaticMarkup(React.createElement(nav.WorkspaceNavigation,{user:{name:'A creator',email:'creator@example.test'},view:'library',label:'Products',admin:false,productCount:11,creditsLabel:'250 credits',history:[],onCreate:()=>{},onView:()=>{},onConversation:()=>{},onVisit:()=>{},onSignOut:()=>{}}));
assert.ok(navHtml.indexOf('aria-label="Create product"')<navHtml.indexOf('aria-label="Main navigation"'),'Create appears in DOM focus order before the sidebar navigation');
assert.match(navHtml,/class="workspace-mobile-current" aria-hidden="true">Products/,'The compact header visibly names the current destination');
assert.equal((navHtml.match(/Seller payments/g)||[]).length,1,'Seller payments is available in Account without repeating in the main navigation');
const navViews=[],navPlans=[],plan={id:'saved-plan-fixture',title:'My saved product plan'};
const navTree=nav.WorkspaceNavigation({user:{name:'A creator',email:'creator@example.test'},view:'library',label:'Products',admin:false,productCount:11,creditsLabel:'250 credits',history:[plan],onCreate:()=>{},onView:value=>navViews.push(value),onConversation:value=>navPlans.push(value),onVisit:()=>{},onSignOut:()=>{}});
function descendants(node,predicate,found=[]){if(Array.isArray(node))node.forEach(value=>descendants(value,predicate,found));else if(React.isValidElement(node)){if(predicate(node))found.push(node);descendants(node.props.children,predicate,found);}return found;}
function nodeText(node){if(Array.isArray(node))return node.map(nodeText).join('');if(React.isValidElement(node))return nodeText(node.props.children);return typeof node==='string'||typeof node==='number'?String(node):'';}
for(const menuClass of ['workspace-account-menu workspace-mobile-menu-content','workspace-account-menu workspace-tools-menu']){
 const menu=descendants(navTree,node=>node.props.className===menuClass);assert.equal(menu.length,1);
 const items=descendants(menu[0],node=>typeof node.props.onSelect==='function');
 for(const [label,destination] of [['AI credits','credits'],['Connect assistant','connections']]){const item=items.find(node=>nodeText(node).includes(label));assert.ok(item,`${menuClass} exposes ${label}`);item.props.onSelect();assert.equal(navViews.at(-1),destination);}
 const recent=items.find(node=>nodeText(node).includes(plan.title));assert.ok(recent,`${menuClass} exposes saved plans`);recent.props.onSelect();assert.equal(navPlans.at(-1),plan.id);
}

// Exercise the actual owner-scoped response against the production migrations.
// All fixtures remain local; no provider, email, or financial API is called.
const root=resolve('outputs/workspace-library-qa',randomUUID()),storage=createStorage(root),sql=storage.sqlite,owner='workspace-fixture',other='another-owner';
function insertProduct(item,who=owner){sql.prepare("INSERT INTO products (id,owner,slug,title,description,audience,format,price,color,content,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1900,'orange',?,'draft',?,?)").run(item.id,who,item.slug,item.title,item.description,item.audience,item.format,JSON.stringify(item.content),Date.now(),Date.now());}
const own=products[0],foreign={...products[1],slug:'foreign-fixture'},fileProduct={...products[2],slug:'file-product-fixture'};insertProduct(own);insertProduct(foreign,other);insertProduct(fileProduct);
function upload(productId,who=owner,{mime='image/png',status='completed',key='workspace-cover'}={}){const id=randomUUID();sql.prepare('INSERT INTO uploads (id,owner,product_id,name,mime,size,object_key,status,sha256,created_at,updated_at) VALUES (?,?,?,?,?,10,?,?,?,1,1)').run(id,who,productId,'cover.png',mime,key+'/'+id,status,'fixture-hash');return id;}
const ownCover=upload(own.id),foreignCover=upload(foreign.id,other),draft={type:'book',sections:[],uploadIds:[],coverUploadId:ownCover};
const fileCover=upload(fileProduct.id);
sql.prepare('INSERT INTO file_sale_drafts (product_id,version,data,published_revision_id) VALUES (?,1,?,?)').run(fileProduct.id,JSON.stringify({title:'Existing file product',description:'A finished original PDF',coverUploadId:fileCover}),'permanent-publication-fixture');
sql.prepare('INSERT INTO product_builder_workspaces (product_id,owner,version,data,updated_at) VALUES (?,?,1,?,1)').run(own.id,owner,JSON.stringify(draft));
sql.prepare('INSERT INTO product_builder_workspaces (product_id,owner,version,data,updated_at) VALUES (?,?,1,?,1)').run(foreign.id,other,JSON.stringify({...draft,coverUploadId:foreignCover}));
const route=load('app/api/workspace/route.ts',{database:()=>storage.DB,identity:async()=>({userId:owner}),failure:error=>Response.json({error:error.message},{status:500}),productFromRow:row=>({id:row.id,title:row.title,status:row.status}),providerSettings:async()=>({config:{textProvider:'openai',paused:false},connected:{openai:false,fal:false}}),isAdmin:()=>false,creditBalance:async()=>({total:0}),textCredits:()=>10});
const response=await route.GET(),data=await response.json();assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(data.products.length,2);assert.equal(data.builders.length,1);assert.equal(data.builders[0].coverUrl,'/api/uploads/'+ownCover);assert.equal(data.fileSales[0].coverUrl,'/api/uploads/'+fileCover);assert.equal(data.fileSales[0].pagePublished,true);assert.doesNotMatch(JSON.stringify(data),/object_key|fixture-hash|workspace-cover|another-owner/,'Private storage details do not leave the server');
for(const invalid of [foreignCover,upload(own.id,owner,{mime:'application/pdf'}),upload(own.id,owner,{status:'pending'}),upload(own.id,owner,{key:'voice/private'})]){
 sql.prepare('UPDATE product_builder_workspaces SET data=? WHERE product_id=?').run(JSON.stringify({...draft,coverUploadId:invalid}),own.id);
 assert.equal((await (await route.GET()).json()).builders[0].coverUrl,undefined,'Only an owned, completed, non-voice image can appear in the library');
}
sql.prepare('UPDATE product_builder_workspaces SET data=? WHERE product_id=?').run(JSON.stringify(draft),own.id);
sql.prepare('INSERT INTO creator_voice_sources (id,owner,product_id,title,kind,upload_id,updated_at) VALUES (?,?,?,?,?,?,1)').run(randomUUID(),owner,own.id,'Private voice fixture','file',ownCover);
assert.equal((await (await route.GET()).json()).builders[0].coverUrl,undefined,'An image used as private creator-voice evidence is never repurposed as a library cover');
sql.close();
console.log('Workspace library: all 11 builder routes, combined filters, stable sorting, accessible controls, and owner-only cover metadata passed. Fixtures retained at '+root);
