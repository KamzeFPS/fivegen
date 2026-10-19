'use client';
import {useState} from 'react';

type CreditHistory={email:string;purchasedBalance:number;grants:{id:string;credits:number;applied:boolean;created_at:number}[];hasMore:boolean};

export default function CreditGrantForm(){
  const [email,setEmail]=useState(''),[credits,setCredits]=useState(50),[busy,setBusy]=useState(false),[checking,setChecking]=useState(false),[message,setMessage]=useState(''),[lookupError,setLookupError]=useState(''),[history,setHistory]=useState<CreditHistory|null>(null);
  const checked=history?.email===email.trim().toLowerCase();
  async function readHistory(address:string){
    const response=await fetch(`/api/admin/credits/grant?email=${encodeURIComponent(address)}`,{cache:'no-store'}),data=await response.json() as CreditHistory&{error?:string};
    if(!response.ok)throw new Error(data.error||'Account history could not load.');
    return data;
  }
  async function lookup(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy||checking)return;
    setChecking(true);setHistory(null);setLookupError('');setMessage('');
    try{setHistory(await readHistory(email.trim()));}
    catch(error){setLookupError(error instanceof Error?error.message:'Account history could not load.');}
    finally{setChecking(false);}
  }
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy||checking||!checked)return;
    setMessage('');
    if(!window.confirm(`Grant ${credits} AI credits to ${email.trim()}? This will add non-expiring credits to their FiveGen account.`))return;
    setBusy(true);
    try{
      const response=await fetch('/api/admin/credits/grant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),credits,requestId:crypto.randomUUID()})});
      const data=await response.json() as {error?:string;creditsGranted?:number;purchasedBalance?:number};
      if(!response.ok)throw new Error(data.error||'Credit grant failed.');
      setMessage(`Granted ${data.creditsGranted} credits. Their purchased balance is now ${data.purchasedBalance}.`);
      try{setHistory(await readHistory(email.trim()));}catch{setHistory(null);setLookupError('Check the account again to refresh its grant history.');}
    }catch(error){setMessage(error instanceof Error?error.message:'Credit grant failed.');setHistory(null);}finally{setBusy(false);}
  }
  return <div>
    <form className="gen-manual-form" onSubmit={lookup}>
      <label>Account email<input type="email" required maxLength={320} value={email} disabled={busy||checking} onChange={event=>{setEmail(event.target.value);setHistory(null);setLookupError('');setMessage('');}} /></label>
      <button className="button" type="submit" disabled={busy||checking}>{checking?'Checking…':'Check account'}</button>
      <p>Checking an account does not add credits.</p>
      {lookupError&&<p role="alert">{lookupError}</p>}
    </form>
    {checked&&history&&<section aria-label="Account credit history">
      <h2>Credit history for {history.email}</h2>
      <p>Purchased credit balance: <strong>{history.purchasedBalance}</strong></p>
      {history.grants.length?<div style={{overflowX:'auto'}}><table><caption>{history.hasMore?'Latest 100 administrative grants':'Administrative grants'}</caption><thead><tr><th scope="col">Time</th><th scope="col">Credits</th><th scope="col">Status</th><th scope="col">Grant ID</th></tr></thead><tbody>{history.grants.map(grant=><tr key={grant.id}><td><time dateTime={new Date(grant.created_at).toISOString()}>{new Date(grant.created_at).toLocaleString()}</time></td><td>{grant.credits}</td><td>{grant.applied?'Applied':'Not applied'}</td><td style={{overflowWrap:'anywhere'}}><code>{grant.id}</code></td></tr>)}</tbody></table></div>:<p>No administrative credit grants were found for this account.</p>}
    </section>}
    <form className="gen-manual-form" onSubmit={submit}>
      <label>AI credits<input type="number" min={1} max={1000} step={1} required value={credits} disabled={busy||checking||!checked} onChange={event=>setCredits(Number(event.target.value))}/></label>
      <button className="button primary" type="submit" disabled={busy||checking||!checked}>{busy?'Granting…':'Grant credits'}</button>
      {!checked&&<p>Check the account and review its history to enable credit grants.</p>}
    </form>
    {message&&<p role="status">{message}</p>}
  </div>;
}
