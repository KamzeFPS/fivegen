'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Loader2,RefreshCw} from 'lucide-react';
import './purchase-email-status.css';

type Report={readiness:{ready:boolean;providerReady:boolean;originReady:boolean;workerReady:boolean;message:string};counts:Record<string,number>};
function count(value:unknown){return typeof value==='number'&&Number.isSafeInteger(value)&&value>0?value:0;}

// Rendered only inside administrator settings; the endpoint separately verifies
// the admin session. Checking status never dispatches or resends any message.
export function PurchaseEmailStatus({revision=0}:{revision?:number}){
  const [report,setReport]=useState<Report|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState('');
  const mounted=useRef(false),requestId=useRef(0),controller=useRef<AbortController|null>(null);
  const check=useCallback(async()=>{
    const current=++requestId.current;controller.current?.abort();const pending=new AbortController();controller.current=pending;
    setBusy(true);setError('');setReport(null);
    try{
      const response=await fetch('/api/admin/purchase-emails',{method:'GET',cache:'no-store',signal:AbortSignal.any([pending.signal,AbortSignal.timeout(15000)])}),body=await response.json() as Report&{error?:string};
      if(!response.ok)throw new Error(body.error||'Purchase email status could not be checked. Try again.');
      if(!body.readiness||['ready','providerReady','originReady','workerReady'].some(key=>typeof body.readiness[key as keyof Report['readiness']]!=='boolean')||typeof body.readiness.message!=='string'||!body.counts||typeof body.counts!=='object')throw new Error('Purchase email status could not be read. Try again.');
      if(mounted.current&&requestId.current===current)setReport({readiness:body.readiness,counts:body.counts});
    }catch(reason){if(mounted.current&&requestId.current===current&&!pending.signal.aborted)setError(reason instanceof Error&&reason.name==='TimeoutError'?'Checking email status timed out. Try again.':reason instanceof Error?reason.message:'Purchase email status could not be checked. Try again.');}
    finally{if(mounted.current&&requestId.current===current)setBusy(false);}
  },[]);
  useEffect(()=>{mounted.current=true;void check();return()=>{mounted.current=false;requestId.current++;controller.current?.abort();};},[check,revision]);
  return <section className="platform-settings-section purchase-email-status" aria-labelledby="purchase-email-heading" aria-busy={busy}>
    <div className="platform-section-description"><h3 id="purchase-email-heading">Purchase confirmations</h3><p>Private access links for customers after verified live product payments.</p></div>
    <div className="purchase-email-status-body">
      <div className="purchase-email-status-heading"><span className="purchase-email-state" data-ready={!!report?.readiness.ready}>{busy?'Checking delivery…':error?'Check unavailable':report?.readiness.ready?'Ready to send':'Setup needed'}</span><button type="button" className="button secondary" disabled={busy} aria-label="Refresh purchase email status" onClick={()=>void check()}>{busy?<Loader2 size={14} className="spin"/>:<RefreshCw size={14}/>}Refresh</button></div>
      {busy?<p role="status">Checking saved email configuration…</p>:error?<p className="purchase-email-status-error" role="alert">{error}</p>:report&&<>
        <p>{report.readiness.message}</p>
        <dl className="purchase-email-counts" aria-label="Purchase email delivery counts">{[['Queued',count(report.counts.pending)+count(report.counts.sending)],['Sent',count(report.counts.sent)],['Failed',count(report.counts.failed)]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{Number(value).toLocaleString()}</dd></div>)}</dl>
        {!report.readiness.providerReady&&<a className="text-link" href="#platform-key-resend">Configure Resend</a>}
        {!report.readiness.workerReady&&<p>Start the production server with <code>PURCHASE_EMAILS_WORKER_ENABLED=true</code>. Its private dispatcher credential is generated automatically; marketing automations stay separate.</p>}
        {!report.readiness.originReady&&<p>Set <code>APP_ORIGIN</code> to FiveGen’s canonical HTTPS origin so purchase links return to your site.</p>}
        <small>Sent means accepted by Resend. Sandbox confirmations are suppressed. Existing purchases are never emailed retroactively.</small>
      </>}
    </div>
  </section>;
}
