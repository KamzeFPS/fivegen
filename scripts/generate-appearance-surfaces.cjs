#!/usr/bin/env node
/*
 * Generate the legacy appearance compatibility sheet from existing app CSS.
 * Run: node scripts/generate-appearance-surfaces.cjs [--check]
 *
 * New components should consume --fg-* tokens directly. This bridge changes
 * color declarations only, preserves each selector's media/container conditions,
 * and keeps authored sales pages, document paper, artwork and video untouched.
 * The light palette darkens status/link ink while retaining bright action fills.
 * Documentation starts light and receives a separate dark adaptation.
 *
 * After visual QA, coordinate any regeneration with manual fixes to the output.
 */
const fs=require('node:fs'), path=require('node:path');
const repoRoot=path.resolve(__dirname,'..');
process.chdir(repoRoot);
const postcss=require(path.join(repoRoot,'node_modules/postcss'));
const outputPath='app/appearance-surfaces.css';
const checkOnly=process.argv.includes('--check');
let generated='';
const palette={canvas:'#f5f4f0',panel:'#ffffff',surface:'#ecebe6',line:'#d7d7d0',ink:'#20221f',muted:'#62665e',accent:'#b3470d'};
const protectedRoots=['.sales-landing','.product-page-view','.fs-public','.storefront','.studio-storefront','.flow-body','.published-funnel','.pb-writing-canvas','.ps-markdown-preview','.ps-editor-label','.ps-writing-stats','.written-reader','.buyer-reader-paper','.ps-theme-sample','.ps-cover-canvas canvas','.product-cover','.buyer-cover','.asset-preview','.gen-public-preview','.public-home','.docs-code'];
const protectedSelector=':is('+protectedRoots.join(',')+') *';
const ignoredFiles=new Set(['appearance-surfaces.css','appearance.css','brand.css','public-home.css','docs/docs.css','file-sale.css','b/[slug]/product-page.css','creator/catalog.css','customer/written-content.css']);
const imports=fs.readFileSync('app/layout.tsx','utf8').matchAll(/import "\.\/([^\"]+\.css)"/g);
let ordered=[...imports].map(x=>x[1]);
for(const f of fs.readdirSync('app',{recursive:true}).filter(f=>f.endsWith('.css')).sort())if(!ordered.includes(f))ordered.push(f);
function splitSelectors(s){let r=[],depth=0,start=0;for(let i=0;i<s.length;i++){if(s[i]==='('||s[i]==='[')depth++;if(s[i]===')'||s[i]===']')depth--;if(s[i]===','&&!depth){r.push(s.slice(start,i).trim());start=i+1}}r.push(s.slice(start).trim());return r}
function parseHex(h){let x=h.slice(1);if(x.length===3||x.length===4)x=[...x].map(c=>c+c).join('');let n=parseInt(x.slice(0,6),16);return[(n>>16)&255,(n>>8)&255,n&255,x.length===8?parseInt(x.slice(6),16)/255:1]}
function hue(r,g,b){r/=255;g/=255;b/=255;let hi=Math.max(r,g,b),lo=Math.min(r,g,b),d=hi-lo;let h=0;if(d)h=hi===r?((g-b)/d)%6:hi===g?(b-r)/d+2:(r-g)/d+4;h=(h*60+360)%360;return[h,(hi+lo)/2,d===0?0:d/(1-Math.abs(hi+lo-1))]}
function colored(h,kind){if(h<18||h>345)return kind==='bg'?'#fff0ec':kind==='line'?'#dfb2a5':'#9b3525';if(h<60)return kind==='bg'?'#fff0df':kind==='line'?'#e4c3a1':palette.accent;if(h<175)return kind==='bg'?'#eaf4ed':kind==='line'?'#b7d0bd':'#256140';if(h<255)return kind==='bg'?'#edf2fc':kind==='line'?'#bdcce6':'#315ca0';return kind==='bg'?'#f1ecfa':kind==='line'?'#cdbfe3':'#6940a2'}
function mapHex(hex,prop){const [r,g,b,a]=parseHex(hex),[h,l,s]=hue(r,g,b),near=Math.max(r,g,b)-Math.min(r,g,b)<30||s<.18,alpha= a<1?Math.round(a*255).toString(16).padStart(2,'0'):'';
 const shadow=prop.includes('shadow');if(shadow)return near&&l<.5?'#20221f'+Math.round(a*.24*255).toString(16).padStart(2,'0'):hex;
 const line=prop.includes('border')||prop.includes('outline')||prop==='column-rule';
 const bg=prop.startsWith('background');
 if(a<.01)return hex;
 if(line){if(a<1&&near)return '#20221f'+alpha;if(near)return palette.line;return s>.28?colored(h,'line'):palette.line}
 if(bg){if(a<1&&near)return '#20221f'+alpha;if(near||s<.25){if(l<.055)return palette.canvas;if(l<.10)return palette.panel;if(l<.35)return palette.surface;return hex}if(l<.35)return colored(h,'bg');return hex}
 if(near||s<.25){if(a<1)return '#20221f'+alpha;return l>.77?palette.ink:l>.31?palette.muted:palette.ink}
 if(a<1)return colored(h,'text')+alpha;
 return colored(h,'text');
}
const colorProps=/^(color|background(?:-color|-image)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-color)?|outline(?:-color)?|box-shadow|text-shadow|fill|stroke|caret-color|column-rule|scrollbar-color)$/;
function adaptValue(value,prop){if(prop==='color-scheme')return value==='dark'?'light':null;if(!colorProps.test(prop))return null;let changed=false;let out=value.replace(/#[a-f\d]{3,8}\b/gi,h=>{const n=mapHex(h,prop);if(n!==h)changed=true;return n});out=out.replace(/rgba?\(\s*255\s*,\s*255\s*,\s*255\s*(?:,\s*([\d.]+)\s*)?\)/g,(_,a)=>{changed=true;return a?'rgba(32,34,31,'+a+')':palette.ink});return changed?out:null}
function adaptSelector(s){if(!s||s.includes(':root')||s.includes('@')||s.startsWith('html')||s.startsWith('body')||/(^|[\s>+~])(video|canvas)(?=[\s.:#\[]|$)/.test(s))return null;if(protectedRoots.some(x=>s.includes(x)))return null;let pseudo='';s=s.replace(/(::(?:before|after|placeholder|selection|marker|file-selector-button|-webkit-[\w-]+|-moz-[\w-]+))$/g,x=>(pseudo=x,''));return `html[data-appearance='light'] ${s}:where(:not(${protectedSelector}))${pseudo}`}
let entries=0,files=0;
let output=`/*
 * Appearance compatibility layer.
 * New UI uses the semantic --fg-* tokens below. The declarations that follow
 * bridge existing, hardcoded studio colors without changing layout or content.
 * Every rule is opt-in to light appearance. Creator-owned sales-page styles,
 * artwork, video, document paper and template previews keep their own palettes.
 * Keep this import after the existing design sheets.
 */
html[data-appearance='dark'] { color-scheme: dark; }
html[data-appearance='light'] {
  color-scheme: light;
  --fg-bg: ${palette.canvas};
  --fg-canvas: ${palette.canvas};
  --fg-panel: ${palette.panel};
  --fg-surface: ${palette.surface};
  --fg-border: ${palette.line};
  --fg-text: ${palette.ink};
  --fg-primary: ${palette.ink};
  --fg-muted: ${palette.muted};
  --fg-secondary: ${palette.muted};
  --fg-accent: #b3470d;
  --fg-focus: #b3470d;
  --fg-paper: #fbf9f3;
  --fg-ink: #2b2c29;
  --background: var(--fg-bg);
  --foreground: var(--fg-text);
  --card: var(--fg-panel);
  --card-foreground: var(--fg-text);
  --popover: var(--fg-panel);
  --popover-foreground: var(--fg-text);
  --primary: #ff873a;
  --primary-foreground: #261307;
  --secondary: var(--fg-surface);
  --secondary-foreground: var(--fg-text);
  --muted: var(--fg-surface);
  --muted-foreground: var(--fg-muted);
  --accent: #f6e5d8;
  --accent-foreground: #783611;
  --destructive: #a43127;
  --border: var(--fg-border);
  --input: #b9bdb2;
  --ring: var(--fg-focus);
  --sidebar: var(--fg-bg);
  --sidebar-foreground: var(--fg-muted);
  --sidebar-primary: #b3470d;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #ecebe6;
  --sidebar-accent-foreground: var(--fg-text);
  --sidebar-border: var(--fg-border);
  --sidebar-ring: var(--fg-focus);
  --text-muted: var(--fg-muted);
  --chart-1: #b3470d; --chart-2: #6952aa; --chart-3: #3567a5;
  --chart-4: #bd5927; --chart-5: #a14084;
  --fg-chart-sales: #b3470d; --fg-chart-net: #256140;
  --fg-chart-orders: #6940a2; --fg-chart-visits: #315ca0;
  --fg-chart-contacts: #a85b10; --fg-chart-plays: #315ca0;
  --fg-chart-clicks: #6940a2; --fg-chart-bookings: #256140;
}
html[data-appearance='light'] body { background: var(--fg-bg); color: var(--fg-text); }
html[data-appearance='light'] :is(h1,h2,h3):where(:not(${protectedSelector})) { color: var(--fg-text); }
html[data-appearance='light'] :is(.pb-app,.ps-import-dialog) {
  --ps-panel: var(--fg-panel); --ps-subtle: #f1f0eb;
  --ps-border: var(--fg-border); --ps-secondary: var(--fg-muted);
}
html[data-appearance='light'] :is(.workspace-calendar,.calendar-dialog) {
  --cal-bg: var(--fg-bg); --cal-surface: var(--fg-panel);
  --cal-border: var(--fg-border); --cal-text: var(--fg-text);
  --cal-muted: var(--fg-muted); --cal-orange: #b3470d;
}
html[data-appearance='light'] :is(.fj-builder,.fj-mobile-dialog) {
  --fj-surface: var(--fg-panel); --fj-muted: var(--fg-muted);
  --fb-text: var(--fg-text); --fb-muted: var(--fg-muted);
  --fb-panel: var(--fg-panel); --fb-line: var(--fg-border);
  --fb-accent: #b3470d;
}
html[data-appearance='light'] .auth-page {
  --auth-bg: var(--fg-bg); --auth-text: var(--fg-text);
  --auth-accent: #ff873a; --auth-accent-hover: #fa984f;
  --auth-muted: var(--fg-muted); --auth-surface: var(--fg-panel);
  --auth-surface-hover: var(--fg-surface); --auth-border: var(--fg-border);
  --auth-control-border: #92988a; --auth-placeholder: #6d7467;
  --auth-error-text: #9b3525; --auth-error-bg: #fff0ec;
  --auth-error-border: #dfb2a5; --auth-success-text: #256140;
  --auth-success-bg: #eaf4ed; --auth-success-border: #b7d0bd;
}
`;
for(const f of ordered){if(ignoredFiles.has(f))continue;const full='app/'+f;if(!fs.existsSync(full))continue;const ast=postcss.parse(fs.readFileSync(full,'utf8'));let section='';ast.walkRules(rule=>{
 let ancestor=rule.parent,at=[];while(ancestor&&ancestor.type!=='root'){if(ancestor.type==='atrule'){if(/keyframes/.test(ancestor.name))return;if(!['media','supports','container'].includes(ancestor.name))return;at.unshift('@'+ancestor.name+' '+ancestor.params)}ancestor=ancestor.parent}
 const sels=splitSelectors(rule.selector).map(adaptSelector).filter(Boolean);if(!sels.length)return;
 let decl=[];for(const d of rule.nodes||[]){if(d.type!=='decl')continue;const value=adaptValue(d.value,d.prop);if(value!==null)decl.push('  '+d.prop+': '+value+(d.important?' !important':'')+';')}
 if(!decl.length)return;
 let text=sels.join(',\n')+' {\n'+decl.join('\n')+'\n}\n';for(let i=at.length-1;i>=0;i--)text=at[i]+' {\n'+text+'}\n';section+=text;entries++
 });if(section){output+='\n/* '+f+' — existing component color compatibility. */\n'+section;files++}}
generated=output;
// Docs starts from an intentionally light editorial design. Give its chrome and
// article content a real dark palette while preserving code examples.
const docs=postcss.parse(fs.readFileSync('app/docs/docs.css','utf8'));let docsOut='';
// Composite translucent neutral surfaces as dark surfaces too. Near-white RGB
// values can have high HSL saturation despite looking neutral (e.g. #fbfaf7).
function darkDocsHex(hex,prop){const[r,g,b,a]=parseHex(hex),[h,l,s]=hue(r,g,b),near=Math.max(r,g,b)-Math.min(r,g,b)<30||s<.18;const alpha=a<1?Math.round(a*255).toString(16).padStart(2,'0'):'';if(prop.includes('shadow'))return hex;if(prop.includes('border')||prop.includes('outline'))return '#41473e'+alpha;if(prop.startsWith('background')){if(a<1){if(l<.4)return hex;if(!near&&s>.28)return '#b8854e'+alpha;return (a>.8?'#111214':'#1b1d21')+alpha}if(l<.4)return hex;return !near&&s>.12?'#20271e':'#1b1d21'}if(a<1)return '#f3f3ef'+alpha;if(s>.28&&h<60)return '#ffad7a';return l<.27?'#f1f1eb':l<.65?'#b3b9ae':'#f1f1eb'}
docs.walkRules(rule=>{let parents=[],p=rule.parent;while(p&&p.type!=='root'){if(p.type==='atrule'){if(/keyframes/.test(p.name))return;parents.unshift('@'+p.name+' '+p.params)}p=p.parent}let sels=splitSelectors(rule.selector).filter(s=>!s.includes('.docs-code')).map(s=>`html[data-appearance='dark'] ${s}`);if(!sels.length)return;let decl=[];for(const d of rule.nodes||[]){if(d.type!=='decl'||!colorProps.test(d.prop))continue;let changed=false;let val=d.value.replace(/#[a-f\d]{3,8}\b/gi,h=>{const n=darkDocsHex(h,d.prop);changed ||= n!==h;return n});if(changed)decl.push('  '+d.prop+': '+val+(d.important?' !important':'')+';')}if(!decl.length)return;let str=sels.join(',\n')+' {\n'+decl.join('\n')+'\n}\n';for(let i=parents.length-1;i>=0;i--)str=parents[i]+' {\n'+str+'}\n';docsOut+=str});
generated+=`\n/* Documentation shares the account preference, including search portals. */
html[data-appearance='dark'] :is(.docs-site,.docs-search-dialog,.docs-mobile-dialog) {
 --docs-bg: #111214; --docs-panel: #1b1d21; --docs-ink: #f1f1eb;
 --docs-muted: #b3b9ae; --docs-rule: #363c34; --docs-accent: #ffad7a;
 --docs-soft: #38271e;
}
${docsOut}
/* Inverse actions and code are intentional; avoid pale text on a pale button. */
html[data-appearance='dark'] .docs-primary { background:#d4e3c8; border-color:#d4e3c8; color:#1c2c20!important; }
html[data-appearance='dark'] .docs-primary:hover { background:#e4f0db; }
html[data-appearance='dark'] .docs-primary.secondary { background:transparent; border-color:#65735d; color:#dce7d6!important; }
html[data-appearance='light'] :is(input,textarea,select):where(:not(${protectedSelector})) { color-scheme:light; }
html[data-appearance='light'] :is(button,a,input,textarea,select,summary):focus-visible:where(:not(${protectedSelector})) { outline-color:var(--fg-focus); }
`;

generated+=`
/* Accent ink and action fills have different contrast jobs. */
html[data-appearance='light'] :is(.button.primary,.button.dark,.buyer-button.primary,.funnel-builder .fb-button.primary,.paddle-pricing .seller-payment-dashboard,.paddle-pricing .paddle-tier-featured .paddle-buy,.creation-idea-footer>button):where(:not(${protectedSelector})) { background:#ff873a; border-color:#ff873a; color:#261307; }
html[data-appearance='light'] :is(.button.primary,.button.dark,.buyer-button.primary,.funnel-builder .fb-button.primary,.paddle-pricing .seller-payment-dashboard,.paddle-pricing .paddle-tier-featured .paddle-buy,.creation-idea-footer>button):hover:where(:not(${protectedSelector})) { background:#fa984f; border-color:#fa984f; color:#261307; }
`;

if(checkOnly) {
  const current=fs.existsSync(outputPath)?fs.readFileSync(outputPath,'utf8'):'';
  if(current!==generated) { console.error('Appearance surface output is stale. Regenerate with node scripts/generate-appearance-surfaces.cjs.'); process.exit(1); }
  console.log('Appearance surfaces are reproducible: '+files+' source sheets, '+entries+' color rules.');
} else {
  fs.writeFileSync(outputPath,generated);
  console.log('Generated '+outputPath+': '+files+' source sheets, '+entries+' color rules.');
}
