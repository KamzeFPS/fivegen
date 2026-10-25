'use client';
import {useEffect,useState} from 'react';
import {Download,FileText,ShieldCheck,RefreshCw,ArrowLeft,GraduationCap} from 'lucide-react';
import type {SaleModule,SaleUpload} from '@/lib/file-sale-contract';
import {Brand} from '@/app/ui-brand';
import '@/app/file-sale.css';
type Access={owner:boolean;title:string;description:string;modules:SaleModule[];uploads:SaleUpload[]};
export default function FileSaleAccess({slug}:{slug:string}){
 const [data,setData]=useState<Access|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[token,setToken]=useState('');
 async function load(){setBusy(true);setError('');try{
  const query=new URLSearchParams(location.search);let cached='';try{cached=sessionStorage.getItem(`fivegen-access:${slug}`)||'';}catch{/* Private browsing may disable storage. */}let accessToken=query.get('token')||token||cached;
  const sessionId=query.get('session_id');
  if(sessionId){const r=await fetch('/api/file-sales/confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug,sessionId})});const body=await r.json() as {error?:string;accessToken?:string};if(!r.ok||!body.accessToken)throw new Error(body.error||'Your payment is still being confirmed. Retry in a moment.');accessToken=body.accessToken;}
  let stored=false;if(accessToken){try{sessionStorage.setItem(`fivegen-access:${slug}`,accessToken);stored=true;}catch{/* Keep the token in memory and the incoming URL for recovery. */}setToken(accessToken);}
  let response=await fetch(`/api/file-sales/access/${encodeURIComponent(slug)}${accessToken?'?token='+encodeURIComponent(accessToken):''}`,{cache:'no-store'});
  // An invalid old link must not override valid signed-in purchase-email access.
  if(response.status===403&&accessToken){const emailAccess=await fetch(`/api/file-sales/access/${encodeURIComponent(slug)}`,{cache:'no-store'});if(emailAccess.ok){response=emailAccess;accessToken='';setToken('');try{sessionStorage.removeItem(`fivegen-access:${slug}`);}catch{}stored=true;}}
  const body=await response.json() as Access&{error?:string};if(!response.ok)throw new Error(body.error||'Your purchase could not be loaded.');setData(body);
  // Remove private references from browser history after confirmation. They are
  // kept only for this browser tab; recovery also uses the purchase-email login.
  if(stored&&(query.has('token')||query.has('session_id')))history.replaceState(null,'',`/access/${encodeURIComponent(slug)}`);
 }catch(e){setError(e instanceof Error?e.message:'Please try again.');}finally{setBusy(false);}}
 useEffect(()=>{void load();},[slug]); // eslint-disable-line react-hooks/exhaustive-deps
 function recoverByEmail(switchAccount=false){try{sessionStorage.removeItem(`fivegen-access:${slug}`);}catch{}setToken('');const welcome=`/welcome?return_to=${encodeURIComponent('/access/'+slug)}`;location.assign(switchAccount?`/signout-with-chatgpt?return_to=${encodeURIComponent(welcome)}`:welcome);}
 const fileUrl=(id:string,download=false)=>`/api/uploads/${id}?${new URLSearchParams({...token?{token}:{},...download?{download:'1'}:{}})}`;
 return <div className="fs-public"><div className="fs-access"><header className="fs-access-header"><a href="/" aria-label="FiveGen home"><Brand tone="dark"/></a><span className="fs-muted"><ShieldCheck size={14} style={{display:'inline',marginRight:7}}/>Your private product library</span></header>
  {busy&&!data?<p role="status" className="fs-notice">Verifying your access…</p>:null}
  {error?<div className="fs-access-module"><h1>Let’s restore your access</h1><p className="fs-notice fs-error" role="alert">{error}</p><p className="fs-muted">If you already purchased, sign in with the same email used at checkout. You do not need a receipt email to access your product.</p><div className="fs-access-actions"><button className="fs-primary" onClick={load} disabled={busy}><RefreshCw size={16}/>Retry access check</button><button className="fs-primary" onClick={()=>recoverByEmail()}>Use purchase-email access</button><button className="fs-primary" onClick={()=>recoverByEmail(true)}>Use a different purchase email</button></div></div>:null}
  {data&&!error?<><h1>{data.title}</h1><p className="fs-muted">{data.description}</p>{data.owner&&<p className="fs-notice">Creator preview of the saved draft. Buyers receive only their purchased features and approved updates.</p>}
   {data.modules.map(m=><section className="fs-access-module" key={m.kind}><h2>{m.kind==='downloads'?<FileText size={22} style={{display:'inline',marginRight:10}}/>:<GraduationCap size={22} style={{display:'inline',marginRight:10}}/>}{m.name}</h2>{m.kind==='downloads'?m.uploadIds.map(id=>{const file=data.uploads.find(f=>f.id===id);return file?<div className="fs-access-file" key={id}><span>{file.name}<small style={{display:'block',marginTop:5}}>{(file.size/1024/1024).toFixed(2)} MB · Original file</small></span><a href={fileUrl(id,true)} className="fs-primary"><Download size={16}/>Download</a></div>:<p key={id} className="fs-notice">This file is temporarily unavailable. Retry access or contact the creator; your entitlement is preserved.</p>;}):m.sections.map((s,i)=><details key={s.id||i} open={i===0}><summary>{String(i+1).padStart(2,'0')} · {s.title}</summary>{s.objective&&<p className="fs-muted">{s.objective}</p>}{s.videoId&&<video controls playsInline preload="metadata" src={fileUrl(s.videoId)} aria-label={s.title}/>}<div className="fs-access-lesson">{s.body}</div></details>)}</section>)}
   {data.uploads.some(file=>!file.mime.startsWith('video/')&&!data.modules.some(m=>m.kind==='downloads'&&m.uploadIds.includes(file.id)))&&<section className="fs-access-module"><h2>Previous purchased files</h2><p className="fs-muted">Earlier versions remain available alongside your updates.</p>{data.uploads.filter(file=>!file.mime.startsWith('video/')&&!data.modules.some(m=>m.kind==='downloads'&&m.uploadIds.includes(file.id))).map(file=><div className="fs-access-file" key={file.id}><span>{file.name}</span><a className="fs-primary" href={fileUrl(file.id,true)}><Download size={16}/>Download original</a></div>)}</section>}
   <p className="fs-notice">Your purchase keeps its original features. Published PDF updates are included; additional features appear only when the creator explicitly grants access.</p><a href="/" className="fs-muted"><ArrowLeft size={14} style={{display:'inline'}}/> Back to FiveGen</a>
  </>:null}
 </div></div>;
}
