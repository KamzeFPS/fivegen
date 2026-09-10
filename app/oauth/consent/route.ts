import {identity,ApiError,database} from "@/lib/server";
import {digest,mcpOrigin,oauthFailure,randomToken,readConsentTicket,validateAuthorization} from "@/lib/mcp-auth";
export async function POST(req:Request){try{
  const origin=mcpOrigin(req);if(req.headers.get("origin")!==origin)throw new ApiError("This request is not allowed.",403);
  const user=await identity(),raw=await req.text();if(raw.length>25000)throw new ApiError("Request too large.",413);const form=new URLSearchParams(raw);
  const {data}=await validateAuthorization(await readConsentTicket(form.get("ticket")||"",user.userId),origin),redirect=new URL(data.redirect_uri);
  redirect.searchParams.set("state",data.state);redirect.searchParams.set("iss",origin);
  if(form.get("decision")!=="allow"){redirect.searchParams.set("error","access_denied");return Response.redirect(redirect,303);}
  const allowed=data.scope.split(" "),scopes=[...new Set(form.getAll("scope"))];
  if(!scopes.includes("products:read")||scopes.some(s=>!allowed.includes(s)))throw new ApiError("Keep workspace reading enabled to connect.");
  const code=randomToken(),now=Date.now(),db=database();
  await db.batch([db.prepare("DELETE FROM mcp_codes WHERE expires<?").bind(now),db.prepare("INSERT INTO mcp_codes (hash,client_id,owner,redirect,challenge,scopes,resource,expires,used) VALUES (?,?,?,?,?,?,?,?,0)").bind(await digest(code),data.client_id,user.userId,data.redirect_uri,data.code_challenge,scopes.join(" "),data.resource,now+120000)]);
  redirect.searchParams.set("code",code);return new Response(null,{status:303,headers:{Location:redirect.toString(),"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
}catch(e){return oauthFailure(e);}}
