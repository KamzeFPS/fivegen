'use client';

import {useEffect,useState} from 'react';
import {Copy,Loader2,Plus,Users,X} from 'lucide-react';
import type {TeamLicenseView} from '@/lib/product-team-server';
import './team-content.css';

export function TeamContent({orderId,canManage=true}:{orderId:string;canManage?:boolean}){
  const [loaded,setLoaded]=useState<{orderId:string;data:TeamLicenseView}|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(''),[email,setEmail]=useState(''),[copied,setCopied]=useState(false),[readOnly,setReadOnly]=useState(!canManage);
  const report=loaded?.orderId===orderId?loaded.data:null;
  useEffect(()=>{
    if(!canManage)return;const controller=new AbortController();let active=true;
    async function load(){setLoading(true);setError('');try{const response=await fetch(`/api/commerce/customer/${orderId}/team`,{cache:'no-store',signal:controller.signal});if(response.status===403){if(active)setReadOnly(true);return;}const data=await response.json() as TeamLicenseView&{error?:string};if(!response.ok)throw new Error(data.error||'Your team access could not load.');if(active){setLoaded({orderId,data});setReadOnly(false);}}catch(cause){if(active)setError(cause instanceof Error?cause.message:'Your team access could not load.');}finally{if(active)setLoading(false);}}
    void load();return()=>{active=false;controller.abort();};
  },[orderId,canManage]);
  async function change(input:{action:'grant';email:string}|{action:'revoke';seatId:string}){
    if(busy)return;setBusy(input.action==='grant'?'grant':input.seatId);setError('');
    try{const response=await fetch(`/api/commerce/customer/${orderId}/team`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}),data=await response.json() as TeamLicenseView&{error?:string};if(!response.ok)throw new Error(data.error||'Team access could not be updated.');setLoaded({orderId,data});if(input.action==='grant')setEmail('');}catch(cause){setError(cause instanceof Error?cause.message:'Team access could not be updated.');}finally{setBusy('');}
  }
  async function more(){
    if(busy||!report||report.nextOffset===null)return;setBusy('more');setError('');try{const response=await fetch(`/api/commerce/customer/${orderId}/team?offset=${report.nextOffset}`,{cache:'no-store'}),data=await response.json() as TeamLicenseView&{error?:string};if(!response.ok)throw new Error(data.error||'More teammates could not load.');setLoaded({orderId,data:{...data,seats:[...report.seats,...data.seats]}});}catch(cause){setError(cause instanceof Error?cause.message:'More teammates could not load.');}finally{setBusy('');}
  }
  if(!canManage||readOnly)return <section className="buyer-team-access"><header><Users size={21}/><div><h3>Your team access</h3><p>Your purchaser has included you in this team license. Sign in with your assigned email to return to this product.</p></div></header></section>;
  if(!loading&&!error&&!report?.enabled)return null;
  return <section className="buyer-team-access" aria-labelledby="buyer-team-heading" aria-busy={loading}>
    <header><Users size={22}/><div><h3 id="buyer-team-heading">Team access</h3><p>Give your teammates their own access to this purchased playbook.</p></div></header>
    {loading?<p className="buyer-team-status" role="status"><Loader2 size={16} className="spin"/>Loading your team license…</p>:report&&<>
      <p className="buyer-team-capacity"><strong>{report.allocated+1} of {report.totalSeats}</strong> seats in use, including yours.{report.remaining>0?` ${report.remaining} ${report.remaining===1?'seat is':'seats are'} available.`:''}</p>
      <form className="buyer-team-add" onSubmit={event=>{event.preventDefault();if(email.trim())void change({action:'grant',email:email.trim()});}}><label>Teammate email<input type="email" value={email} maxLength={254} required placeholder="teammate@company.com" autoComplete="off" disabled={!!busy||report.remaining===0} onChange={event=>setEmail(event.target.value)}/></label><button className="buyer-button primary" type="submit" disabled={!!busy||report.remaining===0||!email.trim()}>{busy==='grant'?<Loader2 size={15} className="spin"/>:<Plus size={16}/>}Add teammate</button></form>
      <div className="buyer-team-share"><p>Share your library link. Each teammate signs in with the email you added.</p><button className="buyer-button secondary" type="button" onClick={()=>{void navigator.clipboard.writeText(window.location.origin+'/customer').then(()=>setCopied(true)).catch(()=>setError('Copy the library address from your browser to share it.'));}}><Copy size={15}/>{copied?'Library link copied':'Copy library link'}</button></div>
      {!!report.seats.length&&<ul className="buyer-team-members" aria-label="Teammates with access">{report.seats.map(seat=><li key={seat.id}><span><strong>{seat.email}</strong><small>Access active</small></span><button type="button" className="buyer-team-remove" disabled={!!busy} aria-label={`Remove access for ${seat.email}`} onClick={()=>{if(window.confirm(`Remove ${seat.email} from this team license? They will lose access to this product.`))void change({action:'revoke',seatId:seat.id});}}>{busy===seat.id?<Loader2 size={16} className="spin"/>:<X size={16}/>}<span>Remove</span></button></li>)}</ul>}
      {report.nextOffset!==null&&<button type="button" className="buyer-button secondary" disabled={!!busy} onClick={()=>void more()}>{busy==='more'?'Loading…':'Show more teammates'}</button>}
      {report.licenseTerms&&<details className="buyer-team-terms"><summary>Team license terms</summary><p>{report.licenseTerms}</p></details>}
    </>}
    {error&&<p className="buyer-team-error" role="alert">{error}</p>}
  </section>;
}
