import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import sharp from 'sharp';

// Render the real SVG component without a browser, API, timers, or identity.
const path='app/gen-mascot.tsx',source=readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,''),compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
globalThis.genMascotTestReact=React;
const {GenMascot}=await import('data:text/javascript;base64,'+Buffer.from('const React=globalThis.genMascotTestReact;\n'+compiled).toString('base64'));delete globalThis.genMascotTestReact;
const moods=['idle','thinking','curious','helping','happy','concerned'],pictures=[];
const css=readFileSync('app/gen-mascot.css','utf8'),output=resolve('outputs/gen-mascot-qa');mkdirSync(output,{recursive:true});
for(const mood of moods){
 const markup=renderToStaticMarkup(React.createElement(GenMascot,{mood,size:90,className:'test-instance'}));
 assert.ok(markup.includes(`gen-mascot--${mood}`));assert.ok(markup.includes('test-instance'));assert.ok(markup.includes('width:90px;height:90px'));
 assert.ok(markup.includes('viewBox="0 0 240 280"'));assert.equal((markup.match(/aria-hidden="true"/g)||[]).length,2);assert.ok(markup.includes('focusable="false"'));
 for(const color of ['#FF6B00','#141414','#FFFFFF','#FFD3B0','#FF9A4D'])assert.ok(markup.includes(color),`${mood} retains ${color} from the reference`);
 assert.ok(markup.includes('gen-mascot__antenna'));assert.ok(markup.includes('gen-mascot__tag'));assert.ok(markup.includes('>$</text>'));
 assert.ok(!/<(?:img|image|iframe|script|foreignObject)\b/.test(markup),'The mascot contains only its own vector shapes');
 if(mood==='happy'){assert.ok(markup.includes('data-expression="joy"'));assert.ok(markup.includes('gen-mascot__joy-eyes'));assert.ok(markup.includes('data-expression="celebration"'));assert.ok(!markup.includes('class="gen-mascot__eyes"'));}
 else if(mood==='thinking'){assert.ok(markup.includes('data-expression="thinking-dots"'));assert.equal((markup.match(/class="gen-mascot__thought-dot"/g)||[]).length,3);assert.ok(!markup.includes('gen-mascot__eyes'));}
 else{assert.ok(markup.includes('class="gen-mascot__eyes"'));assert.ok(!markup.includes('data-expression="celebration"'));}
 const svg=markup.match(/<svg[\s\S]*<\/svg>/)[0].replace('<svg ',`<svg class="gen-mascot gen-mascot--${mood}" width="240" height="280" `).replace('><ellipse',`><style>${css}</style><ellipse`);
 writeFileSync(resolve(output,`${mood}.svg`),svg);
 const png=await sharp(Buffer.from(svg)).resize(240,280).png().toBuffer();writeFileSync(resolve(output,`${mood}.png`),png);pictures.push({input:png,left:moods.indexOf(mood)*260+10,top:20});
}
const small=renderToStaticMarkup(React.createElement(GenMascot,{mood:'idle',size:40}));assert.ok(small.includes('width:40px;height:40px'),'The same complete character scales down for the chat header');
for(const selector of ['character','shadow','tag','arm--right','arm--left']){const rule=css.match(new RegExp(`\\.gen-mascot--happy \\.gen-mascot__${selector}\\{([^}]+)\\}`));assert.ok(rule,`${selector} has a celebration animation`);assert.ok(!rule[1].includes('infinite'),'Sale celebrations settle rather than looping');}
assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);assert.match(css,/animation:none!important/);assert.match(css,/\.gen-mascot--happy \.gen-mascot__spark\{opacity:\.8;transform:none\}/,'Reduced motion preserves the happy expression with static decoration');
await sharp({create:{width:1580,height:320,channels:4,background:'#f5f4ef'}}).composite(pictures).png().toFile(resolve(output,'expression-sheet.png'));
console.log(`Gen mascot tests passed: six reference-matched SVG expressions, 40/90px sizes, decorative accessibility, finite celebration, and reduced motion. Visual fixtures: ${output}`);
