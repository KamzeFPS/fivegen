/** A custom catalog hostname serves public catalog content only. The creator's
 * DNS claim cannot activate hosting or TLS; both are trusted platform states. */
export function catalogHostRequest(sqlite,{host,method,path}){
 if(host.length>253||!host.includes('.')||!/^[a-z0-9.-]+$/.test(host))return null;
 const row=sqlite.prepare(`SELECT c.published_slug FROM creator_catalog_domains d JOIN creator_catalogs c ON c.owner=d.owner WHERE d.hostname=? AND d.ownership_verified_at IS NOT NULL AND d.dns_verified_at IS NOT NULL AND d.platform_status='connected' AND d.tls_status='active' AND c.published_at IS NOT NULL AND c.published IS NOT NULL`).get(host);
 if(!row)return null;
 if(!['GET','HEAD'].includes(method))return {status:405,path:null};
 let pathname;try{pathname=decodeURIComponent(path);}catch{return {status:400,path:null};}
 if(pathname.includes('\\')||pathname.split('/').some(part=>part==='.'||part==='..'))return {status:400,path:null};
 if(/^\/(?:assets|_next|brand|fonts)\/[a-zA-Z0-9_./-]+$/.test(pathname)||pathname==='/favicon.ico')return {status:200,path};
 const catalog='/creator/'+encodeURIComponent(String(row.published_slug));
 return pathname==='/'||pathname===catalog?{status:200,path:catalog}:{status:404,path:null};
}
