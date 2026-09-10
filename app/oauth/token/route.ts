import {ApiError,database} from "@/lib/server";
import {digest,mcpOrigin,oauthFailure,oauthJson,randomToken} from "@/lib/mcp-auth";
export async function POST(req:Request){try{
  const raw=await req.text();if(raw.length>12000)throw new ApiError("Request too large.",413);
  const d=new URLSearchParams(raw),db=database(),client=d.get("client_id")||"",resource=d.get("resource"),now=Date.now();
  if(resource!==`${mcpOrigin(req)}/mcp`)throw new ApiError("Invalid OAuth resource.");
  const access=randomToken(),refresh=randomToken(),accessHash=await digest(access),refreshHash=await digest(refresh);let scopes="";
  if(d.get("grant_type")==="authorization_code"){
    const verifier=d.get("code_verifier")||"";if(!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier))throw new ApiError("Invalid code verifier.",401);
    const code=await db.prepare("UPDATE mcp_codes SET used=1 WHERE hash=? AND client_id=? AND resource=? AND redirect=? AND challenge=? AND expires>? AND used=0 RETURNING owner,scopes").bind(await digest(d.get("code")||""),client,resource,d.get("redirect_uri")||"",await digest(verifier),now).first<{owner:string;scopes:string}>();
    if(!code)throw new ApiError("Authorization code expired, used or invalid.",401);
    scopes=code.scopes;
    const registered=await db.prepare("SELECT name FROM mcp_clients WHERE id=?").bind(client).first<{name:string}>();
    await db.prepare("INSERT INTO mcp_connections (id,owner,client_id,name,scopes,resource,access_hash,refresh_hash,access_expires,refresh_expires,revoked,created_at,last_used_at) VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?)").bind(crypto.randomUUID(),code.owner,client,registered?.name||"AI assistant",scopes,resource,accessHash,refreshHash,now+3600000,now+30*86400000,now,now).run();
  }else if(d.get("grant_type")==="refresh_token"){
    const current=await db.prepare("UPDATE mcp_connections SET access_hash=?,refresh_hash=?,access_expires=?,last_used_at=? WHERE refresh_hash=? AND client_id=? AND resource=? AND revoked=0 AND refresh_expires>? RETURNING scopes").bind(accessHash,refreshHash,now+3600000,now,await digest(d.get("refresh_token")||""),client,resource,now).first<{scopes:string}>();
    if(!current)throw new ApiError("Refresh token expired, used or revoked. Reconnect FiveGen.",401);
    scopes=current.scopes;
  }else throw new ApiError("Unsupported grant type.");
  return oauthJson({access_token:access,token_type:"Bearer",expires_in:3600,refresh_token:refresh,scope:scopes});
}catch(e){return oauthFailure(e);}}
