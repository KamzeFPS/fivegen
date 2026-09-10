import { NextResponse, type NextRequest } from "next/server";
// PRODUCT_DOMAIN requires a real domain and wildcard DNS configured by its owner.
export function middleware(request: NextRequest) {
  const metadata:Record<string,string>={"/.well-known/oauth-protected-resource":"/oauth/metadata/resource","/.well-known/oauth-protected-resource/mcp":"/oauth/metadata/resource","/.well-known/oauth-authorization-server":"/oauth/metadata/server"};
  const target=metadata[request.nextUrl.pathname];
  if(target){const url=request.nextUrl.clone();url.pathname=target;return NextResponse.rewrite(url);}
  const domain = process.env.PRODUCT_DOMAIN?.trim().toLowerCase();
  if (!domain) return NextResponse.next();
  const host = request.nextUrl.hostname.toLowerCase();
  if (!host.endsWith("." + domain)) return NextResponse.next();
  const slug = host.slice(0, -domain.length - 1);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || ["www", "app"].includes(slug))
    return NextResponse.next();
  if (request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/p/" + slug;
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}
