'use client';
import {useState} from 'react';

export default function CreditGrantForm(){
  const [email,setEmail]=useState(''),[credits,setCredits]=useState(50),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();setMessage('');
    if(!window.confirm(`Grant ${credits} AI credits to ${email.trim()}? This will add non-expiring credits to their FiveGen account.`))return;
    setBusy(true);
    try{
      const response=await fetch('/api/admin/credits/grant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),credits,requestId:crypto.randomUUID()})});
      const data=await response.json() as {error?:string;creditsGranted?:number;purchasedBalance?:number};
      if(!response.ok)throw new Error(data.error||'Credit grant failed.');
      setMessage(`Granted ${data.creditsGranted} credits. Their purchased balance is now ${data.purchasedBalance}.`);
    }catch(error){setMessage((error as Error).message);}finally{setBusy(false);}
  }
  return <form className="gen-manual-form" onSubmit={submit}>
    <label>Account email<input type="email" required maxLength={320} value={email} onChange={event=>setEmail(event.target.value)} /></label>
    <label>AI credits<input type="number" min={1} max={1000} step={1} required value={credits} onChange={event=>setCredits(Number(event.target.value))}/></label>
    <button className="button primary" type="submit" disabled={busy}>{busy?'Granting…':'Grant credits'}</button>
    {message&&<p role="status">{message}</p>}
  </form>;
}
