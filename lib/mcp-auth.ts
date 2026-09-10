import { z } from "zod";
import { ApiError, binding, database } from "./server";

export const mcpScopes = {
  "products:read": "Read your products, assets, credits and revenue summary",
  "products:write": "Create and edit draft products, files, pricing and funnels",
  "ai:generate": "Spend your FiveGen credits on AI content, images and videos",
  "products:publish": "Publish, unpublish and edit live product pages",
} as const;
export type Scope = keyof typeof mcpScopes;
export type Connection = {id:string;owner:string;client_id:string;name:string;scopes:string;resource:string;access_expires:number};
export function mcpOrigin(request?:Request) {
  if(request && ["localhost","127.0.0.1"].includes(new URL(request.url).hostname)) return new URL(request.url).origin;
  return binding("MCP_ORIGIN") || "https://folio-product-studio.kamzewac.chatgpt.site";
}
export function randomToken(){return crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-","");}
export async function digest(value:string){return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))))).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");}
export async function jsonBody(req:Request,max=20000){
  if(Number(req.headers.get("content-length")||0)>max)throw new ApiError("Request too large.",413);
  const text=await req.text();if(new TextEncoder().encode(text).byteLength>max)throw new ApiError("Request too large.",413);
  try{return JSON.parse(text);}catch{throw new ApiError("Invalid JSON.");}
}
export function oauthJson(data:unknown,status=200){return Response.json(data,{status,headers:{"Cache-Control":"no-store","Access-Control-Allow-Origin":"*"}});}
export function oauthFailure(e:unknown){return oauthJson({error:e instanceof ApiError&&e.status===401?"invalid_grant":"invalid_request",error_description:e instanceof ApiError?e.message:"The request could not be completed."},e instanceof ApiError&&e.status!==401?e.status:400);}
export function checkMcpOrigin(req:Request){const origin=req.headers.get("origin");if(origin&&![mcpOrigin(req),"https://chatgpt.com","https://claude.ai"].includes(origin))throw new ApiError("Origin is not allowed.",403);}
export function requireScope(connection:Connection,scope:Scope){if(!connection.scopes.split(" ").includes(scope))throw new ApiError(`Reconnect with the ${scope} permission to use this tool.`,403);}
export async function authenticateMcp(req:Request){
  checkMcpOrigin(req);
  const match=/^Bearer ([A-Za-z0-9_-]{32,256})$/i.exec(req.headers.get("authorization")||"");
  if(!match)throw new ApiError("Connect your FiveGen account to continue.",401);
  const row=await database().prepare("SELECT id,owner,client_id,name,scopes,resource,access_expires FROM mcp_connections WHERE access_hash=? AND revoked=0 AND access_expires>?").bind(await digest(match[1]),Date.now()).first<Connection>();
  if(!row||row.resource!==`${mcpOrigin(req)}/mcp`)throw new ApiError("Connection expired or was revoked. Reconnect FiveGen.",401);
  await database().prepare("UPDATE mcp_connections SET last_used_at=? WHERE id=? AND revoked=0").bind(Date.now(),row.id).run();
  return row;
}
export const authQuery = z.object({
  client_id:z.string().min(1).max(100),redirect_uri:z.string().url().max(1500),response_type:z.literal("code"),code_challenge:z.string().regex(/^[A-Za-z0-9_-]{43}$/),code_challenge_method:z.literal("S256"),state:z.string().min(1).max(1500),resource:z.string().url(),scope:z.string().max(200).default("products:read products:write"),
});
export async function validateAuthorization(input:unknown,origin:string){
  const data=authQuery.parse(input);
  if(data.resource!==`${origin}/mcp`)throw new ApiError("Invalid OAuth resource.");
  const client=await database().prepare("SELECT * FROM mcp_clients WHERE id=?").bind(data.client_id).first<{id:string;name:string;redirects:string}>();
  if(!client||!JSON.parse(client.redirects).includes(data.redirect_uri))throw new ApiError("The client or callback address is not registered.");
  const scopes=[...new Set(data.scope.split(" ").filter(Boolean))];
  if(!scopes.length||scopes.some(s=>!Object.hasOwn(mcpScopes,s)))throw new ApiError("Unsupported permissions.");
  return {data:{...data,scope:scopes.join(" ")},client};
}
async function ticketKey(){const secret=binding("CREDENTIAL_ENCRYPTION_KEY");if(!secret)throw new ApiError("Connections are not configured yet.",503);return crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"]);}
export async function consentTicket(data:unknown,owner:string){const body=btoa(unescape(encodeURIComponent(JSON.stringify({data,owner,expires:Date.now()+600000}))));const signature=await crypto.subtle.sign("HMAC",await ticketKey(),new TextEncoder().encode(body));return `${body}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;}
export async function readConsentTicket(ticket:string,owner:string){
  try {const [body,signature]=ticket.split(".");if(!body||!signature||ticket.length>16000)throw new Error();const valid=await crypto.subtle.verify("HMAC",await ticketKey(),Uint8Array.from(atob(signature),c=>c.charCodeAt(0)),new TextEncoder().encode(body));if(!valid)throw new Error();const value=JSON.parse(decodeURIComponent(escape(atob(body))));if(value.owner!==owner||value.expires<Date.now())throw new Error();return value.data;}catch{throw new ApiError("This connection request expired. Start again from your AI assistant.",400);}
}
