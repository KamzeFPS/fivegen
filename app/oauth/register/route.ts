import {z} from "zod";
import {ApiError,database} from "@/lib/server";
import {jsonBody,oauthFailure,oauthJson} from "@/lib/mcp-auth";
export async function POST(req:Request){try{
  const data=z.object({client_name:z.string().trim().min(1).max(100).default("AI assistant"),redirect_uris:z.array(z.string().url().max(1500)).min(1).max(5),token_endpoint_auth_method:z.literal("none").optional(),grant_types:z.array(z.enum(["authorization_code","refresh_token"])).optional(),response_types:z.array(z.literal("code")).optional()}).parse(await jsonBody(req));
  for(const uri of data.redirect_uris){const u=new URL(uri);if(u.hash||u.username||u.password||!(u.protocol==="https:"||(u.protocol==="http:"&&["127.0.0.1","localhost","[::1]"].includes(u.hostname))))throw new ApiError("Use an HTTPS callback or a loopback callback.");}
  const db=database(),id=crypto.randomUUID(),now=Date.now();
  const added=await db.prepare("INSERT INTO mcp_clients (id,name,redirects,created_at) SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM mcp_clients WHERE created_at>?)<200").bind(id,data.client_name,JSON.stringify(data.redirect_uris),now,now-3600000).run();
  if(!added.meta.changes)throw new ApiError("Too many connection registrations. Try again later.",429);
  return oauthJson({client_id:id,client_id_issued_at:Math.floor(now/1000),client_name:data.client_name,redirect_uris:data.redirect_uris,token_endpoint_auth_method:"none",grant_types:["authorization_code","refresh_token"],response_types:["code"]},201);
}catch(e){return oauthFailure(e);}}
