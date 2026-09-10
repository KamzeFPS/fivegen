"use client";
import { useState } from "react";
export default function ManageSubscription({token}:{token:string}){
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  return <div><button className="button secondary" disabled={busy} onClick={async()=>{setBusy(true);setError("");try{const r=await fetch("/api/customer-portal",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token})});const d=await r.json() as {url:string;error?:string};if(!r.ok)throw new Error(d.error);location.href=d.url;}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?"Opening…":"Manage subscription"}</button>{error&&<p role="alert">{error}</p>}</div>;
}
