import {headers} from "next/headers";
import {requireChatGPTUser} from "@/app/chatgpt-auth";
import {consentTicket,mcpOrigin,mcpScopes,validateAuthorization} from "@/lib/mcp-auth";
export const dynamic="force-dynamic";
export default async function Authorize({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){return <Consent searchParams={await searchParams}/>;}
async function Consent({searchParams}:{searchParams:Record<string,string|string[]|undefined>}){
  const query=new URLSearchParams();for(const [k,v] of Object.entries(searchParams))if(typeof v==="string")query.set(k,v);
  const user=await requireChatGPTUser(`/oauth/authorize?${query}`);
  const h=await headers(),host=h.get("host")||"";const origin=/^(localhost|127\.0\.0\.1):\d+$/.test(host)?`http://${host}`:mcpOrigin();
  try{const {data,client}=await validateAuthorization(Object.fromEntries(query),origin),ticket=await consentTicket(data,user.userId);
    return <main className="mcp-consent"><div className="mcp-consent-card"><img src="/brand/fivegen-transparent.webp" alt="FiveGen" width="76" height="76"/><span className="eyebrow">CONNECT YOUR WORKSPACE</span><h1>Work with FiveGen<br/>inside {client.name}.</h1><p>Signed in as <strong>{user.email}</strong></p><form action="/oauth/consent" method="post"><input type="hidden" name="ticket" value={ticket}/><div className="mcp-permissions">{data.scope.split(" ").map(scope=><label key={scope}><input type="checkbox" name="scope" value={scope} defaultChecked={scope==="products:read"||scope==="products:write"}/><span>{mcpScopes[scope as keyof typeof mcpScopes]}{scope==="ai:generate"&&<small>Optional. Normal credit prices apply. No automatic credit purchases.</small>}{scope==="products:publish"&&<small>Optional. Allows changes that are visible on your live storefront.</small>}</span></label>)}</div><p className="field-help">Only your workspace is shared. Master API keys, account billing controls and customer contact details stay private. Disconnect anytime in Connect AI.</p><div className="mcp-consent-actions"><button className="button secondary" name="decision" value="deny">Cancel</button><button className="button primary" name="decision" value="allow">Connect FiveGen</button></div></form></div></main>;
  }catch{return <main className="mcp-consent"><div className="mcp-consent-card"><h1>Connection unavailable</h1><p>This request is invalid or has expired. Return to your AI assistant and start the connection again.</p><a className="button secondary" href="/?connect=mcp">Back to FiveGen</a></div></main>;}
}
