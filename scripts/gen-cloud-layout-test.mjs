import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('lib/gen-cloud-layout.ts','utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {genCloudLayout}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const anchor={left:872,top:576,width:104,height:112};
const desktop=genCloudLayout(anchor,1000,800);
assert.equal(desktop.side,'above');
assert.equal(desktop.width,330);
assert.equal(desktop.height,380);
assert.equal(desktop.top+desktop.height+12,anchor.top,'The default cloud sits immediately above Gen');
assert.equal(desktop.left+desktop.tailLeft,anchor.left+anchor.width/2,'The tail points to Gen');
const high=genCloudLayout({...anchor,top:12},1000,800);
assert.equal(high.side,'below','Moving Gen to the top flips its cloud into the available space');
assert.equal(high.top,12+112+12);
const phone=genCloudLayout({left:290,top:430,width:88,height:100},390,664);
assert.equal(phone.side,'above');
assert.equal(phone.width,330);
assert.ok(phone.top+phone.height<430);
const keyboard=genCloudLayout({left:274,top:312,width:88,height:100},390,300,0,180);
assert.ok(keyboard.top>=192&&keyboard.top+keyboard.height<=468,'Cloud stays in the visible viewport when the phone keyboard pans the page');
const panned=genCloudLayout({left:400,top:600,width:104,height:112},700,420,100,300);
assert.ok(panned.left>=112&&panned.top>=312&&panned.left+panned.width<=788&&panned.top+panned.height<=708);
for(const width of [240,320,390,700,1000,1920])for(const height of [200,300,420,664,800,1080]){
  for(const left of [12,width/2-52,width-116])for(const top of [12,height/2-56,height-124]){
    const cloud=genCloudLayout({left,top,width:104,height:112},width,height);
    assert.ok(cloud.left>=12&&cloud.top>=12);
    assert.ok(cloud.left+cloud.width<=width-12&&cloud.top+cloud.height<=height-12,`Cloud fits ${width}×${height}`);
    assert.ok(cloud.width<=330&&cloud.height<=380,'Conversation never becomes a full-screen drawer');
    assert.ok(cloud.tailLeft>=22&&cloud.tailLeft<=cloud.width-22,'Tail stays within the rounded cloud');
  }
}
console.log('Gen cloud layout passed: anchored above, flips near top, follows on phone, and stays bounded across 324 viewport/position combinations.');
