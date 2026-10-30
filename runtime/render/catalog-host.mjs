/** A custom catalog hostname serves public catalog content only. The creator's
 * DNS claim cannot activate hosting or TLS; both are trusted platform states. */
export function catalogHostRequest(sqlite,{host,method,path,source=process.env}){
 if(host.length>253||!host.includes('.')||!/^[a-z0-9.-]+$/.test(host))return null;
 const base=(source.FIVEGEN_WORKSPACE_DOMAIN||'fivegen.ai').trim().toLowerCase().replace(/\.$/,''),label=host.endsWith('.'+base)?host.slice(0,-base.length-1):'';
 const platformDomain=host==='fivegen.ai'||host.endsWith('.fivegen.ai')||host===base||host.endsWith('.'+base)||!!sqlite.prepare("SELECT base_domain FROM (SELECT base_domain FROM workspace_domain_bases UNION SELECT base_domain FROM workspace_domains) WHERE ?=base_domain OR ? LIKE '%.'||base_domain LIMIT 1").get(host,host);
 let row=platformDomain?null:sqlite.prepare(`SELECT d.owner,c.published_slug,c.published_at,c.published FROM creator_catalog_domains d LEFT JOIN creator_catalogs c ON c.owner=d.owner WHERE d.hostname=? AND d.ownership_verified_at IS NOT NULL AND d.dns_verified_at IS NOT NULL AND d.platform_status='connected' AND d.tls_status='active'`).get(host);
 if(!row&&source.FIVEGEN_WORKSPACE_SUBDOMAINS_READY==='true'&&/^[a-z][a-z0-9-]{1,48}[a-z0-9]$/.test(label))row=sqlite.prepare('SELECT d.owner,c.published_slug,c.published_at,c.published FROM workspace_domains d LEFT JOIN creator_catalogs c ON c.owner=d.owner WHERE d.base_domain=? AND d.subdomain=?').get(base,label);
 if(!row)return null;
 const catalog=row.published_at!=null&&row.published?'/creator/'+encodeURIComponent(String(row.published_slug)):null;
 const filesEnabled=source.FIVEGEN_FILE_SALES_ENABLED==='true'&&source.STRIPE_MODE==='test';
 const products=sqlite.prepare(`SELECT p.id,p.slug,p.status,m.path,pp.published_at,pp.published,pp.public_product,b.slug AS builder_slug,b.published_at AS builder_published_at,b.public_snapshot,fr.id AS file_revision FROM workspace_product_paths m JOIN products p ON p.id=m.product_id AND p.owner=m.owner LEFT JOIN product_pages pp ON pp.owner=p.owner AND pp.product_id=p.id LEFT JOIN product_builder_publications b ON b.owner=p.owner AND b.product_id=p.id LEFT JOIN file_sale_drafts f ON f.product_id=p.id LEFT JOIN file_sale_revisions fr ON fr.product_id=p.id AND fr.id=f.published_revision_id WHERE m.owner=? AND p.archived_at IS NULL`).all(row.owner).map(product=>({...product,target:product.published_at!=null&&product.published&&product.public_product?'/product/'+encodeURIComponent(product.slug):Number(product.builder_published_at)>0&&product.public_snapshot?'/b/'+encodeURIComponent(product.builder_slug):filesEnabled&&product.status==='published'&&product.file_revision?'/p/'+encodeURIComponent(product.slug):null})).filter(product=>product.target);
 if(!catalog&&!products.length)return null;
 if(!['GET','HEAD'].includes(method))return {status:405,path:null};
 let pathname;try{pathname=decodeURIComponent(path);}catch{return {status:400,path:null};}
 if(pathname.includes('\\')||pathname.includes('//')||pathname.includes('%')||pathname.split('/').some(part=>part==='.'||part==='..'))return {status:400,path:null};
 if(/^\/(?:assets|_next|brand|fonts)\/[a-zA-Z0-9_./-]+$/.test(pathname)||pathname==='/favicon.ico')return {status:200,path};
 if(catalog&&(pathname==='/'||pathname===catalog))return {status:200,path:catalog};
 const mapped=products.find(product=>pathname==='/'+product.path||pathname==='/'+product.path+'/'||pathname===product.target);
 if(mapped)return {status:200,path:mapped.target};
 // Public pages may load only their own published cover/section assets. Raw
 // uploads, drafts, account APIs and customer entitlements are never proxied.
 const publicAsset=products.some(product=>{
  const slug=encodeURIComponent(product.slug),builderSlug=encodeURIComponent(product.builder_slug||''),imagePrefix='/api/product-pages/'+slug+'/image/',mediaPrefix='/api/public-pages/'+product.id+'/media/';
  return (product.published_at!=null&&product.published&&product.public_product&&pathname.startsWith(imagePrefix)&&/^[a-zA-Z0-9-]+$/.test(pathname.slice(imagePrefix.length)))
   ||(product.published_at!=null&&product.published&&product.public_product&&pathname.startsWith(mediaPrefix)&&/^[a-zA-Z0-9-]+$/.test(pathname.slice(mediaPrefix.length)))
   ||(Number(product.builder_published_at)>0&&(pathname==='/api/builder-cover/'+builderSlug||pathname.startsWith('/api/builder-preview/'+builderSlug+'/')&&/^[a-f0-9-]{36}$/i.test(pathname.slice(('/api/builder-preview/'+builderSlug+'/').length))))
   ||(filesEnabled&&product.status==='published'&&product.file_revision&&pathname==='/api/file-sales/cover/'+slug);
 });
 if(publicAsset)return {status:200,path};
 if(pathname==='/api/page-experiment')return {status:200,path:null,json:{available:false}};
 // Auth, checkout and member access continue at the trusted application origin;
 // no session or authorization header is forwarded through the creator host.
 if(['/customer','/signin','/signin-with-chatgpt','/signup','/welcome'].includes(pathname))return {status:303,path:pathname,canonical:true};
 if(products.some(product=>Number(product.builder_published_at)>0&&pathname==='/b/'+encodeURIComponent(product.builder_slug)||filesEnabled&&product.status==='published'&&product.file_revision&&pathname==='/p/'+encodeURIComponent(product.slug)))return {status:303,path:pathname,canonical:true};
 return {status:404,path:null};
}
