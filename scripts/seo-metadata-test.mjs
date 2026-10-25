import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {mergeMetadata,renderMetadataToHtml} from '../node_modules/vinext/dist/shims/metadata.js';

function load(path, deps = {}) {
  const source = readFileSync(path, 'utf8').replace(/^import[\s\S]*?;\r?\n/gm, '');
  const exports = {};
  new Function('exports', ...Object.keys(deps), ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React}}).outputText)(exports, ...Object.values(deps));
  return exports;
}
const seo = load('lib/seo.ts');
const {SEO_ORIGIN,DOCS_SEO_ORIGIN,SEO_HOME_TITLE,SEO_DESCRIPTION,SEO_LOGO,publicPageMetadata,privatePageMetadata,isPublicHomeQuery,sitemapXml,mainRobotsText,homeStructuredData,jsonLd} = seo;
assert.equal(isPublicHomeQuery({}), true);
assert.equal(isPublicHomeQuery({utm_source:'search',gclid:'example',fbclid:'example'}), true);
for (const key of ['project','view','area','prompt','intent','query','return_to','code','token','unknown']) assert.equal(isPublicHomeQuery({[key]:'value'}), false, key+' must not become an indexable marketing URL');
assert.equal(isPublicHomeQuery({utm_source:'search',project:'private'}), false);
const rootMetadata = load('app/layout.tsx', seo).metadata;
assert.deepEqual(rootMetadata.robots, {index:false,follow:false}, 'New workspace routes default to noindex');
assert.equal(rootMetadata.metadataBase.origin, SEO_ORIGIN);
const home = publicPageMetadata({title:SEO_HOME_TITLE,description:SEO_DESCRIPTION,path:'/'});
const homeHtml = renderMetadataToHtml(mergeMetadata([rootMetadata,home]));
assert.match(homeHtml, /<title>FiveGen — AI Growth Workspace for Creators<\/title>/);
assert.match(homeHtml, /name="robots" content="index, follow"/);
assert.doesNotMatch(homeHtml, /noindex/);
assert.match(homeHtml,/rel="canonical" href="https:\/\/www\.fivegen\.ai\/?"/);
assert.match(homeHtml,/property="og:url" content="https:\/\/www\.fivegen\.ai\/?"/);
assert.ok(homeHtml.includes('property="og:site_name" content="FiveGen"'));
assert.ok(homeHtml.includes('name="twitter:card" content="summary"'));
assert.ok(homeHtml.includes(SEO_LOGO));
assert.ok(homeHtml.includes('/brand/fivegen-sparkle-favicon-96.png'));
assert.ok(homeHtml.includes('/brand/fivegen-sparkle-apple-180.png'));
const privateHtml = renderMetadataToHtml(mergeMetadata([rootMetadata,privatePageMetadata()]));
assert.match(privateHtml, /name="robots" content="noindex, nofollow"/);
assert.doesNotMatch(privateHtml, /rel="canonical"|property="og:url"/, 'Private workspace does not inherit the public homepage canonical or social URL');
for (const path of ['//attacker.test','/pricing?secret=1','/pricing#section','/has space','/back\\slash']) assert.throws(()=>publicPageMetadata({title:'Example',description:'Example',path}));

let signedIn = false;
const page = load('app/page.tsx', {...seo,getChatGPTUser:async()=>signedIn?{userId:'fixture-owner'}:null});
assert.equal((await page.generateMetadata({searchParams:Promise.resolve({})})).alternates.canonical, SEO_ORIGIN+'/');
assert.equal((await page.generateMetadata({searchParams:Promise.resolve({utm_source:'google'})})).robots.index, true);
assert.equal((await page.generateMetadata({searchParams:Promise.resolve({view:'calendar'})})).robots.index, false);
signedIn = true;
assert.equal((await page.generateMetadata({searchParams:Promise.resolve({})})).robots.index, false);

for (const route of ['pricing','terms','privacy','refund']) {
  const metadata = load(`app/${route}/page.tsx`, seo).metadata;
  assert.equal(metadata.alternates.canonical,SEO_ORIGIN+'/'+route);
  assert.equal(metadata.robots.index,true);
  assert.equal(metadata.openGraph.url,metadata.alternates.canonical);
}
const docs = load('lib/docs.ts'),docsLayout=load('app/docs/layout.tsx',seo).metadata;
assert.equal(docsLayout.alternates.canonical,DOCS_SEO_ORIGIN+'/');
assert.equal(docsLayout.robots.index,true);
const docsRoute=load('app/docs/[...slug]/page.tsx',{...seo,...docs});
for (const article of docs.docsArticles) {
  const metadata=await docsRoute.generateMetadata({params:Promise.resolve({slug:article.slug.split('/')})});
  assert.equal(metadata.alternates.canonical,DOCS_SEO_ORIGIN+'/'+article.slug);
  assert.equal(metadata.openGraph.url,metadata.alternates.canonical);
  assert.equal(metadata.description,article.description);
  assert.equal(metadata.robots.index,true);
}
assert.equal((await docsRoute.generateMetadata({params:Promise.resolve({slug:['does-not-exist']})})).robots.index,false);

const productMetadata=await load('app/product/[slug]/page.tsx',{...seo,getPublicProductPage:async()=>({config:{seoTitle:'A creator’s public course',seoDescription:'Public course summary.'},product:{title:'Course',description:'Description'}})}).generateMetadata({params:Promise.resolve({slug:'public-course'})});
assert.equal(productMetadata.alternates.canonical,SEO_ORIGIN+'/product/public-course');
assert.equal(productMetadata.robots.index,true,'Published creator pages keep their indexable behavior after root switches to noindex');
class ApiError extends Error {constructor(message,status=404){super(message);this.status=status;}}
for(const [path,dependency,result] of [
  ['b','getPublicBuilderProduct',{snapshot:{title:'Published course',description:'Original creator description.',studio:{basics:{shortDescription:'The reviewed public description.'}}}}],
  ['g','getPublicFunnel',{title:'Published offer',landing:{headline:'A useful public invitation',subheadline:'The reviewed introduction.'}}],
]) {
  const route=load(`app/${path}/[slug]/page.tsx`,{...seo,ApiError,[dependency]:async()=>result});
  const metadata=await route.generateMetadata({params:Promise.resolve({slug:'published-offer'})});
  assert.equal(metadata.robots.index,true,`Published /${path} snapshot stays indexable`);
  assert.equal(metadata.alternates.canonical,SEO_ORIGIN+`/${path}/published-offer`);
  const html=renderMetadataToHtml(mergeMetadata([rootMetadata,metadata]));
  assert.match(html,/name="robots" content="index, follow"/);
  const unavailable=load(`app/${path}/[slug]/page.tsx`,{...seo,ApiError,[dependency]:async()=>{throw new ApiError('Unavailable',404);}});
  assert.equal((await unavailable.generateMetadata({params:Promise.resolve({slug:'missing'})})).robots.index,false,`Unavailable /${path} snapshot must not index`);
}
const robots=await load('app/robots.txt/route.ts',seo).GET();
assert.match(robots.headers.get('Content-Type'),/text\/plain; charset=utf-8/);
assert.equal(await robots.text(),mainRobotsText());
assert.doesNotMatch(mainRobotsText(),/Disallow: \/\*\?|Disallow: \/\n/,'Google can crawl HTML and discover noindex, fonts and scripts');
const sitemap=await load('app/sitemap.xml/route.ts',seo).GET(),sitemapText=await sitemap.text();
assert.match(sitemap.headers.get('Content-Type'),/application\/xml; charset=utf-8/);
assert.equal((sitemapText.match(/<url>/g)||[]).length,5);
for(const path of seo.publicSitePaths) assert.ok(sitemapText.includes('<loc>'+SEO_ORIGIN+path+'</loc>'));
assert.doesNotMatch(sitemapText,/docs\.fivegen|\/build\/|\/learn\/|\/checkout|lastmod/,'No private records, duplicate docs URLs or fabricated freshness timestamps');
assert.ok([...sitemapText.matchAll(/<loc>(.*?)<\/loc>/g)].every(([,url])=>!url.includes('?')),'No workspace or tracking query in canonical sitemap URLs');
assert.ok(sitemapXml(['https://example.test/?a=1&b=2']).includes('&amp;'));
const schema=homeStructuredData();
assert.equal(schema['@graph'].find(node=>node['@type']==='WebSite').name,'FiveGen');
assert.equal(schema['@graph'].find(node=>node['@type']==='Organization').logo.url,SEO_LOGO);
assert.doesNotMatch(JSON.stringify(schema),/aggregateRating|reviewCount|ratingValue|sameAs|PostalAddress/, 'No fabricated ratings, reviews, social accounts or physical office');
const dangerous={description:'</script><script>alert("x")</script>&\u2028\u2029'};
assert.doesNotMatch(jsonLd(dangerous),/<|>|&|\u2028|\u2029/);
assert.deepEqual(JSON.parse(jsonLd(dangerous)),dangerous);
for (const [name,size] of [['fivegen-sparkle-mark.png',512],['fivegen-sparkle-favicon-96.png',96],['fivegen-sparkle-apple-180.png',180]]) {
  const png=readFileSync('public/brand/'+name);
  assert.equal(png.readUInt32BE(16),size);
  assert.equal(png.readUInt32BE(20),size);
}
console.log('SEO metadata passed: actual Vinext metadata merge/render, canonical/social/index rules, anonymous vs signed-in/query homepage, all public policies and documentation guides, published-course index preservation, root robots/sitemap, honest safe brand JSON-LD and favicon dimensions. No external calls.');
