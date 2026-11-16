import { NextResponse, type NextRequest } from "next/server";
import {retiredCommercePath,commerceGone} from './lib/retired-commerce';
import {readClipperOrigin,clipperHostRequest} from './runtime/render/clipper-host.mjs';
// PRODUCT_DOMAIN requires a real domain and wildcard DNS configured by its owner.
export function middleware(request: NextRequest) {
  const appOrigin=process.env.APP_ORIGIN||'https://www.fivegen.ai';
  const clipper=clipperHostRequest({clipperOrigin:readClipperOrigin(process.env,appOrigin),host:request.nextUrl.host.toLowerCase(),method:request.method,path:request.nextUrl.pathname});
  if(clipper){
    const headers={'Cache-Control':'no-store','X-FiveGen-Surface':'clipper'};
    if(clipper.canonical)return NextResponse.redirect(new URL(clipper.path+request.nextUrl.search,appOrigin),{status:303,headers});
    if(clipper.status!==200)return new NextResponse('Clipping route not found',{status:clipper.status,headers:{...headers,...(clipper.status===405?{Allow:'GET, HEAD'}:{})}});
    if(clipper.text)return new NextResponse(request.method==='HEAD'?null:clipper.text,{headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
    const forwarded=new Headers(request.headers);
    for(const name of [...forwarded.keys()])if(name==='cookie'||name==='authorization'||name.startsWith('oai-authenticated-user-'))forwarded.delete(name);
    forwarded.set('x-fivegen-clipper-host','1');forwarded.set('x-fivegen-app-origin',new URL(appOrigin).origin);
    const path=clipper.path||request.nextUrl.pathname,url=request.nextUrl.clone();url.pathname=path;
    const response=path===request.nextUrl.pathname?NextResponse.next({request:{headers:forwarded}}):NextResponse.rewrite(url,{request:{headers:forwarded}});
    for(const [key,value] of Object.entries(headers))response.headers.set(key,value);
    return response;
  }
  const builderPath=/^\/b(?:\/|$)/.test(request.nextUrl.pathname)||/^\/api\/(?:builder|builder-cover|builder-preview)(?:\/|$)/.test(request.nextUrl.pathname);
  const next=()=>{const response=NextResponse.next();if(builderPath){response.headers.set('Cache-Control','private, no-store');response.headers.set('Referrer-Policy','no-referrer');}return response;};
  const fileSalePage=process.env.FIVEGEN_FILE_SALES_ENABLED==='true'&&process.env.STRIPE_MODE==='test'&&/^\/p\/[^/]+\/?$/.test(request.nextUrl.pathname);
  if(retiredCommercePath(request.nextUrl.pathname)&&!fileSalePage)return commerceGone();
  const metadata:Record<string,string>={"/.well-known/oauth-protected-resource":"/oauth/metadata/resource","/.well-known/oauth-protected-resource/api/mcp":"/oauth/metadata/resource","/.well-known/oauth-authorization-server":"/oauth/metadata/server"};
  const target=metadata[request.nextUrl.pathname];
  if(target){const url=request.nextUrl.clone();url.pathname=target;return NextResponse.rewrite(url);}
  const domain = process.env.PRODUCT_DOMAIN?.trim().toLowerCase();
  if (!domain) return next();
  const host = request.nextUrl.hostname.toLowerCase();
  if (!host.endsWith("." + domain)) return next();
  const slug = host.slice(0, -domain.length - 1);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || ["www", "app"].includes(slug))
    return next();
  if (request.nextUrl.pathname === "/") {
    return commerceGone();
  }
  return next();
}
