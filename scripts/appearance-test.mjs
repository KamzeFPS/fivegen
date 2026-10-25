import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ThemeProvider} from 'next-themes';
import {Monitor,Moon,Sun,CheckIcon,ChevronRightIcon,CircleIcon} from 'lucide-react';
import {DropdownMenu as DropdownMenuPrimitive} from 'radix-ui';
import ts from 'typescript';

function load(path,deps={}) {
  const file=ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let source=file.text;
  for(const node of [...file.statements].reverse())if(ts.isImportDeclaration(node))source=source.slice(0,node.getFullStart())+source.slice(node.getEnd());
  const exports={};
  new Function('exports','React',...Object.keys(deps),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText)(exports,React,...Object.values(deps));
  return exports;
}

let preference='system',resolved='dark',changes=[];
const menu=load('components/ui/dropdown-menu.tsx',{DropdownMenuPrimitive,CheckIcon,ChevronRightIcon,CircleIcon,cn:(...values)=>values.filter(Boolean).join(' ')});
const appearance=load('app/appearance.tsx',{...menu,ThemeProvider,Monitor,Moon,Sun,useSyncExternalStore:(_subscribe,read)=>read(),useTheme:()=>({theme:preference,resolvedTheme:resolved,setTheme:value=>changes.push(value)})});
const documentHtml=renderToStaticMarkup(React.createElement(appearance.AppearanceProvider,null,React.createElement('main',null,'Original workspace')));
const script=documentHtml.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'The actual provider renders a bootstrap script for the initial paint');
assert.ok(documentHtml.indexOf('<script')<documentHtml.indexOf('<main>'),'Appearance is resolved before the workspace content paints');
assert.ok(documentHtml.includes('Original workspace'),'Provider preserves server-rendered content');
function initialPaint(saved,osDark,{blocked=false}={}) {
  const classes=new Set(['dark']),attributes={},style={};
  const document={documentElement:{classList:{remove:(...values)=>values.forEach(value=>classes.delete(value)),add:value=>classes.add(value)},setAttribute:(name,value)=>attributes[name]=value,style}};
  const localStorage={getItem(key){assert.equal(key,'fivegen.appearance');if(blocked)throw new Error('Storage blocked');return saved;}};
  runInNewContext(script,{document,localStorage,window:{matchMedia:query=>{assert.equal(query,'(prefers-color-scheme: dark)');return{matches:osDark};}}});
  return {classes:[...classes],appearance:attributes['data-appearance'],colorScheme:style.colorScheme};
}
for(const [saved,osDark,expected] of [['light',true,'light'],['dark',false,'dark'],['system',true,'dark'],['system',false,'light'],[null,false,'light'],[null,true,'dark']]) {
  const actual=initialPaint(saved,osDark);
  assert.deepEqual(actual,{classes:[expected],appearance:expected,colorScheme:expected},'Saved choice wins; System follows the device before content paints');
}
assert.doesNotThrow(()=>initialPaint(null,false,{blocked:true}),'A browser that blocks preference storage still renders the page');

for(const value of ['system','light','dark']) {
  preference=value;resolved=value==='light'?'light':'dark';
  const compact=appearance.AppearanceControl({});
  const select=compact.props.children.find(child=>child?.type==='select');
  assert.equal(select.props.value,value);
  assert.equal(select.props['aria-label'],'Appearance');
  assert.deepEqual(select.props.children.map(option=>option.props.value),['system','light','dark']);
  select.props.onChange({target:{value:value==='dark'?'light':'dark'}});
  const segmented=appearance.AppearanceControl({variant:'segmented'});
  const buttons=segmented.props.children[1].props.children;
  assert.equal(buttons.filter(button=>button.props['aria-pressed']).length,1);
  assert.equal(buttons.find(button=>button.props['aria-pressed']).key,value);
  buttons[0].props.onClick();
}
assert.deepEqual(changes,['dark','system','dark','system','light','system'],'Both accessible controls update the same shared provider');
preference='light';
const menuTree=appearance.AppearanceMenuItems(),radioGroup=menuTree.props.children[1],items=radioGroup.props.children;
const menuHtml=renderToStaticMarkup(React.createElement(DropdownMenuPrimitive.Root,{defaultOpen:true},React.createElement(DropdownMenuPrimitive.Trigger,null,'Account'),React.createElement(DropdownMenuPrimitive.Content,{forceMount:true},menuTree)));
assert.equal((menuHtml.match(/role="menuitemradio"/g)||[]).length,3,'All preferences are real Radix menu radio items in the account menu focus collection');
assert.equal((menuHtml.match(/aria-checked="true"/g)||[]).length,1,'The menu exposes one selected preference');
const radioTags=[...menuHtml.matchAll(/<div\b[^>]*role="menuitemradio"[^>]*>/g)].map(match=>match[0]);
assert.ok(radioTags[1].includes('aria-checked="true"')&&radioTags[1].includes('data-state="checked"'),'Light is the selected radio item in the real rendered menu');
radioGroup.props.onValueChange('dark');assert.equal(changes.at(-1),'dark','A radio selection updates the same persisted theme provider');
const beforeInvalid=changes.length;radioGroup.props.onValueChange('unrecognized');assert.equal(changes.length,beforeInvalid);
let focused=-1,prevented=0,stopped=0;
const focusItems=items.map((_,index)=>({focus(){focused=index;},parentElement:{querySelectorAll(){return focusItems;}}}));
items[1].props.onKeyDown({key:'ArrowRight',currentTarget:focusItems[1],preventDefault(){prevented++;},stopPropagation(){stopped++;}});assert.equal(focused,2);
items[0].props.onKeyDown({key:'ArrowLeft',currentTarget:focusItems[0],preventDefault(){prevented++;},stopPropagation(){stopped++;}});assert.equal(focused,2,'Horizontal navigation wraps through the visible preference row');
items[1].props.onKeyDown({key:'ArrowDown',currentTarget:focusItems[1],preventDefault(){prevented++;},stopPropagation(){stopped++;}});assert.equal(prevented,2);assert.equal(stopped,2,'Vertical arrows and Enter remain under Radix menu keyboard handling');
const {Brand}=load('app/ui-brand.tsx');
const automatic=renderToStaticMarkup(React.createElement(Brand));
assert.ok(automatic.includes('data-brand-tone="auto"'));
assert.ok(automatic.includes('fivegen-sparkle-light.webp')&&automatic.includes('fivegen-sparkle-dark.webp'));
assert.equal((automatic.match(/role="img"/g)||[]).length,1,'Automatic lockup has one accessible identity');
const forced=renderToStaticMarkup(React.createElement(Brand,{tone:'dark'}));
assert.ok(forced.includes('fivegen-sparkle-dark.webp')&&!forced.includes('fivegen-sparkle-light.webp'),'Creator-designed dark previews keep their explicit branding');
console.log('Appearance passed: real pre-paint provider script, persisted explicit choices, device light/dark defaults, synchronized DOM classes/data/color-scheme, blocked-storage safety, accessible controls and Radix menu radio semantics sharing one preference, horizontal row navigation, and automatic/explicit logo variants. No external calls.');
