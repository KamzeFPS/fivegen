"use client";
import {useEffect,useState} from "react";
import {ArrowUpRight,Coins,Loader2,RefreshCw} from "lucide-react";
import {creditPacks,type CreditBalance} from "@/lib/credit-policy";
import {money} from "@/lib/product";
type CreditData={balance:CreditBalance;billingReady:boolean;costs:{text:number;image:number;video:number};history:Array<{operation:string;cost:number;state:string;created_at:number}>};
export function CreditsPanel({signedIn}:{signedIn:boolean}){
  const [data,setData]=useState<CreditData|null>(null),[busy,setBusy]=useState(""),[error,setError]=useState("");
  async function load(){if(!signedIn)return;try{const q=new URLSearchParams(location.search),session=q.get("billing")==="credits"?q.get("session_id"):null;const r=await fetch(`/api/credits${session?`?session_id=${encodeURIComponent(session)}`:""}`),d=await r.json() as CreditData&{error:string};if(!r.ok)throw new Error(d.error);setData(d);if(session)history.replaceState(null,"","/?billing=plans");}catch(e){setError((e as Error).message);}}
  useEffect(()=>{void load();},[signedIn]);
  async function buy(pack:string){if(!signedIn){location.href="/signin-with-chatgpt?return_to=/?billing=plans";return;}setBusy(pack);setError("");try{const r=await fetch("/api/credits",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pack})}),d=await r.json() as {url:string;error:string};if(!r.ok)throw new Error(d.error);location.href=d.url;}catch(e){setError((e as Error).message);}finally{setBusy("");}}
  return <section className="credits-panel panel"><div className="panel-heading"><div><span className="eyebrow">YOUR CREATIVE FUEL</span><h2>Credits, ready when you are.</h2><p>FiveGen takes care of the AI. No provider accounts or API keys needed.</p></div><button className="icon-button" aria-label="Refresh credit balance" onClick={()=>void load()}><RefreshCw size={17}/></button></div>
    {error&&<p role="alert" className="error-banner">{error}</p>}
    <div className="credit-balances">{[["Starter text",data?.balance.starter,"One-time allowance · text only"],["Pro monthly",data?.balance.included,data?.balance.renewsAt?`Refreshes ${new Date(data.balance.renewsAt).toLocaleDateString()}`:"1,000 credits per month on Pro"],["Purchased",data?.balance.purchased,"No expiry · text, images & video"]].map(([label,value,note])=><div key={String(label)}><span>{label}</span><strong>{value===undefined?"—":Number(value).toLocaleString()}</strong><small>{note}</small></div>)}</div>
    <div className="credit-rate-strip"><span>Text step or rewrite <b>{data?.costs.text??10} credits</b></span><span>Marketing image <b>12 credits</b></span><span>5s video + audio <b>160 credits</b></span></div>
    <p className="field-help">A complete product uses 5–12 text steps. You pay only for completed steps; pause between steps anytime. Starter credits cannot generate images or videos. Monthly credits reset and do not roll over. Confirmed failed generations return their credits.</p>
    <div className="credit-pack-grid">{creditPacks.map(p=><div className="credit-pack" key={p.id}><Coins size={19}/><h3>{p.credits.toLocaleString()} credits</h3><strong>{money(p.cents)}</strong><small>One-time refill · available on any plan</small><button className="button secondary full" disabled={!!busy||(signedIn&&!data?.billingReady)} onClick={()=>void buy(p.id)}>{busy===p.id?<Loader2 className="spin" size={15}/>:<ArrowUpRight size={15}/>}Add credits</button></div>)}</div>
    {signedIn&&data&&!data.billingReady&&<p className="field-help">Credit purchases open once the administrator connects Stripe billing.</p>}
    {!!data?.history.length&&<details className="credit-history"><summary>Recent credit activity</summary>{data.history.map((h,i)=><div key={i}><span>{h.operation==="text"?"Product content":h.operation==="image"?"Marketing image":"Marketing video"}<small>{new Date(h.created_at).toLocaleString()}</small></span><span>{h.state==="refunded"?"Returned":h.state==="reserved"?"Reserved":"Used"} {h.cost} credits</span></div>)}</details>}
  </section>;
}
