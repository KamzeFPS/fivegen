/** Route only public documentation on the docs hostname. Never run auth or APIs there. */
export function readDocsOrigin(source,appOrigin){
 const app=new URL(appOrigin);
 const raw=source.DOCS_ORIGIN?.trim()||(['fivegen.ai','www.fivegen.ai'].includes(app.hostname)?'https://docs.fivegen.ai':'');
 if(!raw)return null;
 const url=new URL(raw);
 if(url.pathname!=='/'||url.search||url.hash||url.username||url.password||url.host===app.host||
    (url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','docs.localhost'].includes(url.hostname))))throw Error('DOCS_ORIGIN must be a separate HTTPS origin');
 return url.origin;
}
export function docsHostRequest({docsOrigin,host,method,path}){
 if(!docsOrigin||host!==new URL(docsOrigin).host)return null;
 if(!['GET','HEAD'].includes(method))return {status:405,path:null};
 let pathname;try{pathname=decodeURIComponent(path);}catch{return {status:400,path:null};}
 if(pathname.includes('\\')||pathname.includes('\0')||pathname.split('/').some(part=>part==='.'||part==='..'))return {status:400,path:null};
 if(/^\/(?:assets|_next|brand|fonts)\//.test(pathname)||['/favicon.ico','/llms.txt'].includes(pathname))return {status:200,path};
 if(pathname==='/robots.txt'||pathname==='/sitemap.xml')return {status:200,path:'/docs'+pathname};
 if(/^\/docs(?:\/[a-z0-9-]+(?:\.(?:json|txt|xml))?)*\/?$/.test(pathname))return {status:200,path};
 if(pathname==='/')return {status:200,path:'/docs'};
 // These are guide groups too. They still resolve exclusively under /docs;
 // account and commerce application handlers never receive this request.
 if(/^\/(?:account|sell)\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(pathname))return {status:200,path:'/docs'+pathname.replace(/\/$/,'')};
 if(/^\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*\/?$/.test(pathname)&&!['api','signin','signup','signout','callback','customer','admin','build','sell','account','operations'].includes(pathname.split('/')[1]))return {status:200,path:'/docs'+pathname.replace(/\/$/,'')};
 return {status:404,path:null};
}
