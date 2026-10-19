'use client';
import {useRef,useState} from 'react';
import {ArrowUpRight} from 'lucide-react';
export default function FileSalePurchase({slug,revisionId,ready,message,email}:{slug:string;revisionId:string;ready:boolean;message:string;email?:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(false);const requestId=useRef<string>('');
 async function buy(){if(busy)return;setBusy(true);setError('');setRefresh(false);try{requestId.current ||=crypto.randomUUID();const r=await fetch('/api/file-sales/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug,expectedRevisionId:revisionId,requestId:requestId.current,...(email?{email}:{})})});const data=await r.json() as {error?:string;url?:string};if(!r.ok){if(r.status===409)setRefresh(true);throw new Error(data.error||'Checkout could not be opened. Please retry.');}if(!data.url)throw new Error('Checkout did not return a payment page. Please retry.');window.location.assign(data.url);}catch(e){setError(e instanceof Error?e.message:'Please retry.');setBusy(false);}}
 return <><button className="fs-primary" disabled={!ready||busy||refresh} onClick={buy}>{busy?'Opening secure checkout…':'Buy with test payment'}<ArrowUpRight size={17}/></button>{!ready&&<p className="fs-notice" role="status">{message}</p>}{error&&<p className="fs-notice fs-error" role="alert">{error}</p>}{refresh&&<a className="fs-primary" href={`/p/${encodeURIComponent(slug)}`}>Refresh offer and start again</a>}</>;
}
