import {database} from "@/lib/server";
import {digest,oauthJson,oauthFailure} from "@/lib/mcp-auth";
export async function POST(req:Request){try{const raw=await req.text();if(raw.length>12000)return oauthJson({error:"invalid_request"},400);const d=new URLSearchParams(raw),hash=await digest(d.get("token")||"");await database().prepare("UPDATE mcp_connections SET revoked=1 WHERE client_id=? AND (access_hash=? OR refresh_hash=?)").bind(d.get("client_id")||"",hash,hash).run();return oauthJson({});}catch(e){return oauthFailure(e);}}
