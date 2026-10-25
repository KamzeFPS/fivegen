import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function load(path,deps={}){const source=fs.readFileSync(path,'utf8').replace(/^import[\s\S]*?;\r?\n/gm,''),exports={};new Function('exports',...Object.keys(deps),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,...Object.values(deps));return exports;}
const docs=load('lib/docs.ts'),{docsArticles,docsGroups,docsManifest,docsLlmsText,searchDocs}=docs;
assert.ok(docsArticles.length>=18&&docsArticles.length<=25,'A useful maintained guide set, not placeholder routes');
assert.equal(new Set(docsArticles.map(article=>article.slug)).size,docsArticles.length);
const slugs=new Set(docsArticles.map(article=>article.slug));let totalWords=0;
for(const article of docsArticles){
 assert.ok(docsGroups.includes(article.group));assert.ok(article.title.length>8);assert.ok(article.description.length>35);assert.ok(article.sections.length>=3);assert.equal(new Set(article.sections.map(section=>section.id)).size,article.sections.length);
 const words=docs.docsText(article).split(/\s+/).length;assert.ok(words>=200,article.slug+' needs substantive guidance');totalWords+=words;
 for(const section of article.sections){assert.match(section.id,/^[a-z0-9-]+$/);for(const link of section.links||[]){if(link.href.startsWith('/docs/'))assert.ok(slugs.has(link.href.slice(6)),'Broken guide link '+link.href);else assert.match(link.href,/^(https:\/\/|mailto:)/);}}
}
assert.equal(searchDocs('stripe connect')[0].slug,'sell/connect-payments');assert.equal(searchDocs('MCP tools')[0].slug,'integrations/mcp-tools');assert.equal(searchDocs('upload files')[0].slug,'create/files-and-recordings');assert.equal(searchDocs('unfindable-synthetic-token').length,0);assert.ok(searchDocs('  PAYMENT  ').length);assert.equal(searchDocs('',3).length,3);
const manifest=docsManifest(),llms=docsLlmsText();assert.equal(manifest.articles.length,docsArticles.length);for(const article of manifest.articles){assert.equal(article.url,'https://docs.fivegen.ai/'+article.slug);assert.ok(llms.includes(article.url));assert.ok(article.text.length>500);}assert.match(llms,/does not publish or activate payments/);assert.ok(!llms.includes('rk_live_'));assert.ok(!llms.includes('whsec_'));
const manifestResponse=load('app/docs/manifest.json/route.ts',docs).GET();assert.equal(manifestResponse.status,200);assert.equal((await manifestResponse.json()).articles.length,docsArticles.length);
const textResponse=load('app/llms.txt/route.ts',docs).GET();assert.match(textResponse.headers.get('Content-Type'),/text\/plain.*utf-8/);assert.equal(await textResponse.text(),llms);
const sitemapResponse=load('app/docs/sitemap.xml/route.ts',docs).GET(),sitemap=await sitemapResponse.text();assert.equal((sitemap.match(/<url>/g)||[]).length,docsArticles.length+1);for(const article of docsArticles)assert.ok(sitemap.includes('https://docs.fivegen.ai/'+article.slug));assert.match(load('app/docs/robots.txt/route.ts').GET().headers.get('Content-Type'),/text\/plain/);
console.log(`Docs site checks passed: ${docsArticles.length} substantive guides (${totalWords} searchable words), valid groups/anchors/internal links, ranked task search and empty result, generated manifest/llms/sitemap/robots, UTF-8, private-MCP boundaries. No network/provider calls.`);
