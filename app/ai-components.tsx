"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Film,
  ImagePlus,
  KeyRound,
  Layers3,
  Loader2,
  LockKeyhole,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {money,type Product} from "@/lib/product";
import {CreditsPanel} from "./credits-panel";
import {PurchaseEmailStatus} from './purchase-email-status';
import type {CreditBalance} from "@/lib/credit-policy";
import type { ProviderConfig } from "@/lib/ai";
import {designImageCredits,type DesignImageQuality} from '@/lib/design-image';
import {ImageQualityControl,useImageQuality} from './image-quality-control';
import {AICreditConsent} from './ai-credit-consent';
import './settings-experience.css';
async function request<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = (await r.json()) as T & { error?: string; status?:string };
  if (!r.ok) throw Object.assign(new Error(d.error || "Please try again."),{httpStatus:r.status,assetStatus:d.status});
  return d;
}
type Settings = {
  config: ProviderConfig;
  connected: { openai: boolean; anthropic: boolean; fal: boolean;resend:boolean };
  secure: boolean;admin:boolean;credits:CreditBalance;costs:{text:number;image:number;video:number};
};
export function AIProviders({signedIn,onUpdate}:{signedIn:boolean;onUpdate:()=>void}){
  const [s,setS]=useState<Settings|null>(null),[keys,setKeys]=useState({openai:"",anthropic:"",fal:"",resend:""}),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [metrics,setMetrics]=useState<{fees:number;creditSales:number;subscriptions:number;todayBudgetUsed:number;accounts:number}|null>(null);
  const [emailStatusRevision,setEmailStatusRevision]=useState(0);
  async function load(){if(!signedIn)return;setError('');try{const settings=await request<Settings>("/api/providers");setS(settings);if(settings.admin)setMetrics(await request("/api/admin"));}catch(e){setError((e as Error).message);}}
  useEffect(()=>{void load();},[signedIn]);
  async function save(remove?:"openai"|"anthropic"|"fal"|"resend"){if(!s)return;setBusy(true);setError("");try{await request("/api/providers","PUT",{config:s.config,...keys,remove});setKeys({openai:"",anthropic:"",fal:"",resend:""});await load();setEmailStatusRevision(value=>value+1);onUpdate();toast.success("Platform AI settings saved");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  if(!s&&signedIn)return <section className="platform-settings"><header className="platform-settings-heading"><h1>Platform settings</h1><p>Manage FiveGen’s AI providers and platform controls.</p></header>{error?<div className="platform-settings-load" role="alert"><p>{error}</p><button className="button secondary" onClick={()=>void load()}>Try again</button></div>:<div className="platform-settings-load" role="status"><Loader2 className="spin" size={20}/><p>Loading platform settings…</p></div>}</section>;
  if(!s?.admin)return <CreditsPanel signedIn={signedIn}/>;
  const names={openai:'OpenAI · GPT Image 2 & text',anthropic:'Anthropic · text',fal:'fal.ai · video',resend:'Resend · email'};
  return <div className="platform-settings"><header className="platform-settings-heading"><div><h1>Platform settings</h1><p>AI providers, platform spending, and administrative tools.</p></div><span className="platform-admin-badge"><ShieldCheck size={15}/>Administrator</span></header><nav className="platform-settings-links" aria-label="Administration tools"><a href="/admin/billing" className="button secondary"><ShieldCheck size={16}/>Payment checks<ArrowRight size={15}/></a><a href="/admin/credits" className="button secondary"><Sparkles size={16}/>Credit grants<ArrowRight size={15}/></a><a href="/?view=credits" className="button secondary">My AI credits<ArrowRight size={15}/></a></nav>{error&&<p className="error-banner" role="alert">{error}</p>}<section id="platform-ai" className="panel admin-ai"><div className="panel-heading"><div><h2>AI providers & usage</h2><p>These master credentials power every account. Keys are encrypted and never returned to the browser.</p></div><ShieldCheck size={24}/></div>
    <dl className="platform-stats">{[["Accounts",metrics?String(metrics.accounts):"—",'Registered FiveGen accounts'],["Credit sales",metrics?money(metrics.creditSales):"—",'Gross receipts, before refunds and costs']].map(([label,value,detail])=><div key={label}><dt>{label}</dt><dd>{value}</dd><small>{detail}</small></div>)}</dl>
    <fieldset className="platform-settings-fields" disabled={busy}>
    <section className="platform-settings-section"><div className="platform-section-description"><h3>Generation</h3><p>Choose the content provider and set a daily spending limit.</p></div><div className="platform-section-fields">
    <div className="form-two"><label>Content provider<Select value={s.config.textProvider} onValueChange={v=>setS({...s,config:{...s.config,textProvider:v as "openai"|"anthropic",textModel:v==="openai"?"gpt-4.1-mini":"claude-haiku-4-5"}})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="openai">OpenAI · GPT-4.1 mini · 10 credits/step</SelectItem><SelectItem value="anthropic">Anthropic · Haiku 4.5 · 30 credits/step</SelectItem></SelectContent></Select></label><label>Daily AI spending cap · USD<input type="number" min={1} max={10000} value={s.config.dailyBudget} onChange={e=>setS({...s,config:{...s.config,dailyBudget:Number(e.target.value)}})}/></label></div>
    <p className="field-help">Today’s conservative cost reservations: $ {metrics?.todayBudgetUsed.toFixed(2)||"0.00"}. This cap includes failed calls and protects platform spending; reconcile actual usage with provider invoices.</p>
    </div></section>
    <section className="platform-settings-section"><div className="platform-section-description"><h3>Provider connections</h3><p>Content, images, video, and transactional email for every account.</p></div><div className="admin-key-grid">{(["openai","anthropic","fal","resend"] as const).map(key=><div className="platform-key-row" key={key}><div className="platform-key-heading"><label htmlFor={`platform-key-${key}`}>{names[key]}</label><span className={`platform-key-status ${s.connected[key]?'is-connected':''}`}>{s.connected[key]?<><CheckCircle2 size={13}/>Connected</>:'Not connected'}</span></div><div className="platform-key-control"><input id={`platform-key-${key}`} aria-label={`${names[key]} ${key==='resend'?'email':'master'} API key`} type="password" autoComplete="new-password" value={keys[key]} placeholder={s.connected[key]?'Leave blank to keep existing key':'Paste API key'} onChange={e=>setKeys({...keys,[key]:e.target.value})}/>{s.connected[key]&&<AlertDialog><AlertDialogTrigger asChild><button type="button" className="text-link platform-remove-key" disabled={busy}>Remove stored key</button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove the {names[key]} key?</AlertDialogTitle><AlertDialogDescription>FiveGen will no longer be able to use this stored key. This also saves the other changes currently shown in this form. Existing products and generated files stay safe.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep key</AlertDialogCancel><AlertDialogAction onClick={()=>void save(key)}>Remove key & save</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}</div></div>)}</div></section>
    <section className="platform-settings-section"><div className="platform-section-description"><h3>Email & availability</h3><p>Use a verified sender and manage generation availability.</p></div><div className="platform-section-fields">
    <label>Support email sender<input type="email" value={s.config.emailFrom||""} placeholder="hello@fivegen.ai" onChange={e=>setS({...s,config:{...s.config,emailFrom:e.target.value}})}/><small>Verify this sender’s domain in Resend before enabling transactional email.</small></label><label className="admin-pause"><input type="checkbox" checked={s.config.paused} onChange={e=>setS({...s,config:{...s.config,paused:e.target.checked}})}/>Pause all new AI generation</label>
    </div></section>
    <div className="platform-settings-save"><button className="button primary" disabled={busy||!s.secure} onClick={()=>void save()}>{busy?<Loader2 className="spin" size={16}/>:<ShieldCheck size={16}/>}Save platform settings</button><p>Changes take effect after you save.</p></div>{!s.secure&&<p className="field-help">Encrypted credential storage needs to be configured on the server.</p>}
    </fieldset>
    <PurchaseEmailStatus revision={emailStatusRevision}/>
    <details className="credit-history"><summary>Credit pricing and capacity</summary><p>One-time packs: $15 for 1,000 credits, $35 for 2,500, or $75 for 6,000. Three complete AI product runs per account are included each UTC month. The daily AI spending cap applies to standard accounts; unlimited owner access is exempt, with provider usage still recorded; monitor usage and provider costs as your audience grows.</p><p>Subscription credits and one-time packs power images, videos, and individual rewrites. AI products beyond the monthly allowance use credits per completed step.</p></details>
  </section></div>;
}
type Job = {
  stage: number;
  status: string;
  error?: string;
  updated_at: number;
};
export function GenerationProgress({
  autoStart=false,
  textCost=10,
  product,
  onProduct,
  onComplete,
  aiReady,
  onSetup,
  onBeforeGenerate,
  onRunningChange,
  onAllowance,
}: {
  autoStart?:boolean;
  textCost?:number;
  product: Product;
  onProduct: (p: Product) => void;
  onComplete: () => void;
  aiReady: boolean;
  onSetup: () => void;
  onBeforeGenerate: () => Promise<boolean>;
  onRunningChange: (running: boolean) => void;
  onAllowance?: (allowance:CreditBalance['products'])=>void;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => { onRunningChange(running); return () => onRunningChange(false); }, [running, onRunningChange]);
  const stop = useRef(false);
  const inProgress = useRef(false);
  const productRef = useRef(product);
  productRef.current = product;
  const [creditConfirm,setCreditConfirm]=useState(false),[confirmedCost,setConfirmedCost]=useState(textCost),[allowance,setAllowance]=useState<{remaining:number;unlimited?:boolean}|null>(null),[paymentMode,setPaymentMode]=useState<string|null>(null),[nextStepLabel,setNextStepLabel]=useState('Create the product outline');
  async function run(approved=false) {
    if (inProgress.current) return;
    if (!aiReady) { onSetup(); return; }
    inProgress.current = true;
    try {
      const status=await request<{mode:string|null;nextStep?:{label:string}|null;allowance:{remaining:number;unlimited?:boolean}}>(`/api/products/${product.id}/generate`);
      setAllowance(status.allowance);setPaymentMode(status.mode);
      setNextStepLabel(status.nextStep?.label||'Generate the next content step');
      const paid=!status.allowance.unlimited&&(status.mode==='credits'||(status.mode!=='included'&&status.allowance.remaining===0));
      if(!approved||(paid&&confirmedCost===0)){const pricing=paid?await request<{costs:{text:number}}>('/api/credits'):null;setConfirmedCost(pricing?.costs.text||0);setCreditConfirm(true);return;}
      setCreditConfirm(false);
      if (!(await onBeforeGenerate())) return;
      stop.current = false;
      setRunning(true);
      setError("");
      if (!stop.current && mounted.current) {
        const d = await request<{
          product: Product;
          done: boolean;
          stage: number;
          total: number;
          mode?:string;
          allowance?:CreditBalance['products'];
        }>(`/api/products/${product.id}/generate`, "POST", {allowCredits:paid,maxStepCredits:paid?confirmedCost:0});
        if (!mounted.current) return;
        onProduct(d.product);
        if(d.mode)setPaymentMode(d.mode);
        if(d.allowance){setAllowance(d.allowance);onAllowance?.(d.allowance);}
        setJob({
          stage: d.stage,
          status: d.done ? "completed" : "queued",
          updated_at: Date.now(),
        });
        if (d.done) {
          toast.success(
            "Your product, supporting files, and launch kit are ready.",
          );
          onComplete();
        }else toast.success('This AI step is saved. Approve the next step to continue.');
      }
    } catch (e) {
      if (mounted.current) {
        setError((e as Error).message);
        setJob((j) => (j ? { ...j, status: "failed" } : j));
      }
    } finally {
      inProgress.current = false;
      if (mounted.current) setRunning(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    stop.current = false;
    void request<{ job: Job | null;mode:string|null;allowance:{remaining:number;unlimited?:boolean} }>(`/api/products/${product.id}/generate`)
      .then((d) => {
        if (!mounted.current) return;
        setJob(d.job);
        setAllowance(d.allowance);setPaymentMode(d.mode);
        // Only a newly created job starts automatically. Reopening a paused
        // or partially completed product always requires an explicit resume.
        if (autoStart && d.job?.status === "queued" && d.job.stage === -1) void run();
        else if (d.job?.status === "running")
          setError(
            "A generation request is still processing. Wait a moment, then resume.",
          );
      })
      .catch((e) => setError(e.message));
    return () => {
      mounted.current = false;
      stop.current = true;
    };
  }, [product.id]);
  const total = product.content.sections.length + 2;
  const completed = job?.status === "completed";
  const percent = completed
    ? 100
    : Math.max(0, Math.min(95, (((job?.stage ?? -1) + 1) / total) * 100));
  return (
    <div className={`generation-progress panel ${completed ? "done" : ""}`}>
      <div className="generation-progress-top">
        <span className="generation-emblem">
          {running ? (
            <Loader2 className="spin" size={21} />
          ) : completed ? (
            <CheckCircle2 size={21} />
          ) : (
            <Sparkles size={21} />
          )}
        </span>
        <div>
          <strong>
            {completed
              ? "Your AI product package is ready."
              : running
                ? job && job.stage >= 0
                  ? job.stage >= product.content.sections.length
                    ? "Building your launch campaign & supporting files…"
                    : `Writing section ${job.stage + 1} of ${product.content.sections.length}…`
                  : "Designing your product architecture…"
                : job
                  ? "Your product is taking shape."
                  : aiReady ? "Take this product further with AI." : "Write your product content."}
          </strong>
          <p>
            {completed
              ? "Review your content, explore your supporting files, and generate your marketing visuals."
              : running
                ? "Each completed step is saved. You can pause after the current step."
                : aiReady ? allowance?.unlimited ? 'Unlimited product generation is included for your account.' : paymentMode==='included' ? 'This complete product is included in your monthly allowance. Resume at no credit cost.' : allowance&&allowance.remaining>0 ? `${allowance.remaining} of 3 included AI products remaining this month. Images and videos use separate credits.` : `Your next AI product uses ${textCost} credits per step. Review the cost before starting.` : "Add your expertise here, or view your AI credits to generate a complete product."}
          </p>
        </div>
        <div className="generation-actions">
          {running ? (
            <button
              className="button secondary"
              onClick={() => {
                stop.current = true;
                toast.info("Generation will pause after this step finishes.");
              }}
            >
              <Pause size={14} />
              Pause
            </button>
          ) : !completed ? (
            <>
              <button className="button primary" onClick={() => aiReady ? void run() : onSetup()}>
                <Play size={14} />
                {!aiReady ? "AI status & credits" : job ? "Resume generation" : "Generate with AI"}
              </button>
              {job && (
                <button
                  className="icon-button"
                  aria-label="Stop AI generation and keep current content"
                  onClick={async () => {
                    try {
                      await request(
                        `/api/products/${product.id}/generate`,
                        "DELETE",
                      );
                      setJob(null);
                      setError("");
                      toast.success(
                        "Generation stopped. Current content is editable.",
                      );
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>
      {job && !completed && (
        <Progress className="generation-meter" value={percent} />
      )}
      <AlertDialog open={creditConfirm} onOpenChange={setCreditConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Approve one AI generation step?</AlertDialogTitle><AlertDialogDescription>{nextStepLabel}. This step uses {confirmedCost} credits{confirmedCost===0?' through your included generation access':''}. This approves one model call only. The next outline, section or supporting-file package requires another approval. Failed paid steps are refunded.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Not now</AlertDialogCancel><AlertDialogAction onClick={()=>void run(true)}>Approve step · {confirmedCost} credits</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      {error && (
        <p role="alert" className="generation-error">
          {error}
        </p>
      )}
    </div>
  );
}
type Asset = {
  id: string;
  kind: "image" | "video";
  name: string;
  prompt: string;
  status: string;
  error?: string;
  created_at: number;
};
export function MediaStudio({ product, onSetup }: { product: Product; onSetup: () => void }) {
  const [readiness, setReadiness] = useState<{image:boolean;video:boolean}|null>(null);
  const [quality,setQuality]=useImageQuality();
  const [balance,setBalance]=useState(0);
  const [unlimited,setUnlimited]=useState(false);
  useEffect(() => { void request<Settings>("/api/providers").then((settings) => {setReadiness({image:settings.connected.openai&&!settings.config.paused,video:settings.connected.fal&&!settings.config.paused});setBalance(settings.credits.media);setUnlimited(!!settings.credits.unlimited);}).catch(() => setReadiness({image:false,video:false})); }, []);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [kind, setKind] = useState<"image" | "video">("image");
  const [aspect, setAspect] = useState("1:1");
  const [prompt, setPrompt] = useState(
    product.content.imagePrompt?.slice(0,2500) ||
      `Create a premium marketing image for "${product.title}". Audience: ${product.audience}. ${product.description}. Refined editorial art direction, confident typography, generous negative space, sophisticated ${product.color} accents.`,
  );
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const busyRef=useRef(false);
  const mediaReady=readiness?.[kind]??null;
  const imageCost=designImageCredits(quality),generationCost=kind==='image'?imageCost:160,campaignCost=imageCost*3+160;
  type Submission={kind:'image'|'video';prompt:string;name:string;aspect:string;quality?:DesignImageQuality};
  const [mediaConsent,setMediaConsent]=useState<{slot:'single'|'campaign';name:string;cost:number;fingerprint:string}|null>(null);
  type RetryRecord={fingerprint:string;ids:string[];done:boolean[]};
  const retryRecords=useRef<Record<string,RetryRecord>>({});
  async function retryRecord(slot:string,inputs:Submission[]){
    const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(inputs)))),byte=>byte.toString(16).padStart(2,'0')).join('');
    const key=`fivegen:marketing-request:${product.id}:${slot}`;
    let saved=retryRecords.current[key];
    if(!saved)try{saved=JSON.parse(sessionStorage.getItem(key)||'null') as RetryRecord;}catch{}
    if(!saved||saved.fingerprint!==fingerprint||!Array.isArray(saved.ids)||saved.ids.length!==inputs.length||!saved.ids.every(id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id))||!Array.isArray(saved.done)||saved.done.length!==inputs.length)saved={fingerprint,ids:inputs.map(()=>crypto.randomUUID()),done:inputs.map(()=>false)};
    retryRecords.current[key]=saved;
    const persist=()=>{try{sessionStorage.setItem(key,JSON.stringify(saved));}catch{}};
    const clear=()=>{delete retryRecords.current[key];try{sessionStorage.removeItem(key);}catch{}};
    persist();return {record:saved,persist,clear};
  }
  async function submit(input:Submission,requestId:string){
    const result=await request<{id:string;status:string;error?:string}>(`/api/products/${product.id}/assets`,'POST',{...input,requestId,maxCredits:unlimited?0:input.kind==='image'?designImageCredits(input.quality||'medium'):160});
    if(result.status==='failed')throw Object.assign(new Error(result.error||'Generation failed. Credits returned.'),{assetStatus:'failed'});
    return result;
  }
  const load = useCallback(async () => {
    try {
      const d = await request<{ assets: Asset[] }>(
        `/api/products/${product.id}/assets`,
      );
      setAssets(d.assets);
      const c=await request<{balance:CreditBalance}>("/api/credits");setBalance(c.balance.media);setUnlimited(!!c.balance.unlimited);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [product.id]);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  const sync = useCallback(async () => {
    const active = assets.filter((a) =>
      ["queued", "running"].includes(a.status),
    );
    if (!active.length && !assets.some(a=>a.status==='submitting')) {await load();return;}
    setSyncing(true);
    try {
      for (const a of active)
        await request(`/api/assets/${a.id}/sync`, "POST", {});
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }, [assets, load]);
  useEffect(() => {
    if (!assets.some((a) => ["submitting", "queued", "running"].includes(a.status))) return;
    const timer = setTimeout(() => void sync(), 10000);
    return () => clearTimeout(timer);
  }, [assets, sync]);
  async function generate(approved=false) {
    if(busyRef.current||!mediaReady||prompt.length<15)return;busyRef.current=true;
    setBusy(true);
    setError("");
    let retry:Awaited<ReturnType<typeof retryRecord>>|undefined;
    try {
      const input:Submission={kind,prompt,name:`${product.title} · ${kind==='image'?'Campaign visual':'Promo video'}`.slice(0,100),aspect,...(kind==='image'?{quality}:{})};
      const quote={slot:'single' as const,name:input.name,cost:unlimited?0:generationCost,fingerprint:JSON.stringify(input)};
      if(!approved||mediaConsent?.slot!==quote.slot||mediaConsent.fingerprint!==quote.fingerprint||mediaConsent.cost!==quote.cost){setMediaConsent(quote);return;}
      setMediaConsent(null);
      retry=await retryRecord('single',[input]);
      const result=await submit(input,retry.record.ids[0]);
      if(result.status!=='submitting')retry.clear();
      await load();
      toast.success(result.status==='completed'?'Your image is saved in the asset library.':result.status==='submitting'?'Your image is still being generated. Refresh its status shortly.':'Your video is in the queue.');
    } catch (e) {
      if((e as {assetStatus?:string}).assetStatus==='failed')retry?.clear();
      setError((e as Error).message);
    } finally {
      busyRef.current=false;
      setBusy(false);
    }
  }
  async function campaign(approved=false) {
    if(busyRef.current)return;busyRef.current=true;
    setBusy(true);
    setError("");
    try {
      const inputs:Submission[]=['1:1','9:16','16:9'].map((aspect,i)=>({kind:'image',prompt:(product.content.imagePrompt||prompt).slice(0,2500),name:['Social square','Story creative','Website banner'][i],aspect,quality}));
      inputs.push({kind:'video',prompt:(product.content.videoPrompt||`Cinematic 5-second product promo for ${product.title}. ${product.description}. Clean modern studio, slow camera push, polished lighting, subtle music.`).slice(0,2500),name:'Launch video',aspect:'9:16'});
      const retry=await retryRecord('campaign',inputs),index=inputs.findIndex((_,i)=>!retry.record.done[i]);
      if(index<0){retry.clear();toast.success('Your campaign assets are already saved.');return;}
      const input=inputs[index],stepCost=unlimited?0:input.kind==='image'?imageCost:160;
      if(!unlimited&&balance<stepCost)throw new Error(`The next campaign asset needs ${stepCost} credits. Add credits first.`);
      const quote={slot:'campaign' as const,name:input.name,cost:stepCost,fingerprint:JSON.stringify({inputs,index})};
      if(!approved||mediaConsent?.slot!==quote.slot||mediaConsent.fingerprint!==quote.fingerprint||mediaConsent.cost!==quote.cost){setMediaConsent(quote);return;}
      setMediaConsent(null);
      try{
        const result=await submit(input,retry.record.ids[index]);
        if(result.status==='submitting'){setError('This campaign image is still generating. Check its status before approving the next asset.');return;}
        retry.record.done[index]=true;retry.persist();
      }catch(error){
        if((error as {assetStatus?:string}).assetStatus==='failed'){retry.record.ids[index]=crypto.randomUUID();retry.persist();}
        throw error;
      }
      if(retry.record.done.every(Boolean)){retry.clear();toast.success('Your 3 campaign images are saved and your video is queued.');}
      else toast.success(`${input.name} is saved. Approve the next campaign asset when you are ready.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await load();
      busyRef.current=false;
      setBusy(false);
    }
  }
  return (
    <div className="media-studio"><div className="media-credit-bar"><span><Sparkles size={16}/> {unlimited?'Unlimited image & video generation':`${balance.toLocaleString()} image/video credits`}</span>{!unlimited&&<button className="button secondary" onClick={onSetup}>Add credits <ArrowRight size={15}/></button>}</div>
      {mediaReady === false && <div className="checkout-setup media-setup"><ImagePlus size={21}/><div><strong>Your FiveGen media studio</strong><p>{kind==='image'?'GPT Image 2 opens when the administrator connects OpenAI and enables generation.':'Video generation opens when the administrator connects the video provider and enables generation.'} Your product stays saved.</p></div><button className="button primary" onClick={onSetup}>View AI & credits <ArrowRight size={15}/></button></div>}
      <section className="media-create panel">
        <div className="panel-heading">
          <div>
            <h2>Your in-house creative studio.</h2>
            <p>
              Original visuals. A consistent identity. Ready for your next
              launch.
            </p>
          </div>
          <Sparkles size={20} />
        </div>
        <div className="media-create-body">
          <div className="media-controls">
            <Tabs
              value={kind}
              onValueChange={(v) => {
                setKind(v as "image" | "video");
                setPrompt(
                  v === "image"
                    ? product.content.imagePrompt || prompt
                    : product.content.videoPrompt ||
                        `Create a 5-second cinematic promotional video for ${product.title}. ${product.description}. Slow deliberate camera movement, clean studio lighting, coherent ${product.color} color palette. No unsupported claims.`,
                );
              }}
            >
              <TabsList>
                <TabsTrigger value="image">
                  <ImagePlus size={14} />
                  Image
                </TabsTrigger>
                <TabsTrigger value="video">
                  <Film size={14} />
                  Video
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={aspect} onValueChange={setAspect}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1:1">Square · 1:1</SelectItem>
                <SelectItem value="9:16">Portrait · 9:16</SelectItem>
                <SelectItem value="16:9">Landscape · 16:9</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label>
            Creative direction
            <textarea
              value={prompt}
              maxLength={2500}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the visual, style, composition, colors, and mood…"
            />
          </label>
          <div className="media-generate-bar">
            <span>
              {kind === "image"
                ? "GPT Image 2"
                : "Kling 2.6 Pro · 5 seconds"}
              <small>{unlimited ? "Included with your unlimited access" : kind === "image" ? `${imageCost} credits per image` : "160 credits · includes audio"}</small>
            </span>
            {kind==='image'&&<ImageQualityControl value={quality} onChange={setQuality} disabled={busy}/>}
            <button
              className="button primary"
              disabled={busy || prompt.length < 15 || !mediaReady || (!unlimited&&balance<generationCost)}
              onClick={() => void generate()}
            >
              {busy ? (
                <Loader2 className="spin" size={15} />
              ) : (
                <Sparkles size={15} />
              )}
              Generate {kind}
            </button>
          </div>
        </div>
      </section>
      <section className="campaign-prompt">
        <span className="type-icon purple">
          <Layers3 size={24} />
        </span>
        <div>
          <h3>{unlimited?'A whole campaign · included.':`A whole campaign · ${campaignCost} credits.`}</h3>
          <p>
            A square post, a story creative, a website banner, and a 5-second
            promo video. Each asset has its own cost approval; the remaining assets never start automatically.
          </p>
        </div>
        <button
          className="button dark"
          disabled={busy || readiness === null}
          onClick={() => readiness?.image&&readiness.video ? void campaign() : onSetup()}
        >
          <WandSparkles size={16} />
          {readiness&&(!readiness.image||!readiness.video) ? "AI status & credits" : unlimited ? "Generate campaign" : `Generate campaign · ${campaignCost} credits`}
        </button>
      </section>
      {error && (
        <div role="alert" className="error-banner">
          {error}
        </div>
      )}
      <div className="section-heading">
        <div>
          <h2>Asset library</h2>
          <p>Everything you generate is saved here.</p>
        </div>
        <div className="asset-filters">
          <Tabs value={filter} onValueChange={setFilter}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="image">Images</TabsTrigger>
              <TabsTrigger value="video">Videos</TabsTrigger>
            </TabsList>
          </Tabs>
          <button
            className="icon-button"
            aria-label="Refresh generation status"
            disabled={syncing}
            onClick={() => void sync()}
          >
            <RefreshCw size={17} className={syncing ? "spin" : ""} />
          </button>
        </div>
      </div>
      <div className="assets-grid">
        {assets
          .filter((a) => filter === "all" || a.kind === filter)
          .map((a) => (
            <article className="asset-card panel" key={a.id}>
              <div className="asset-preview">
                {a.status === "completed" ? (
                  a.kind === "image" ? (
                    <img src={`/api/assets/${a.id}/file`} alt={a.name} />
                  ) : (
                    <video
                      src={`/api/assets/${a.id}/file`}
                      controls
                      preload="metadata"
                    />
                  )
                ) : (
                  <div className="asset-processing">
                    {a.status === "failed" ? (
                      <ImagePlus size={25} />
                    ) : (
                      <Loader2 className="spin" size={25} />
                    )}
                    <strong>
                      {a.status === "failed"
                        ? "Generation failed"
                        : a.status === "queued"
                          ? "In the queue…"
                          : "Creating your asset…"}
                    </strong>
                    <p>
                      {a.error ||
                        "This can take a few minutes. Your job will remain saved."}
                    </p>
                  </div>
                )}
              </div>
              <div className="asset-card-meta">
                <div>
                  <strong>{a.name}</strong>
                  <small>
                    {a.kind === "image" ? "Image" : "Video"} ·{" "}
                    {new Date(a.created_at).toLocaleDateString()}
                  </small>
                </div>
                {a.status === "completed" ? (
                  <a
                    className="icon-button"
                    href={`/api/assets/${a.id}/file?download=1`}
                    aria-label={`Download ${a.name}`}
                  >
                    <ArrowDownToLine size={17} />
                  </a>
                ) : a.status === "failed" ? (
                  <button
                    className="icon-button"
                    aria-label="Use this prompt again"
                    onClick={() => {
                      setKind(a.kind);
                      setPrompt(a.prompt);
                    }}
                  >
                    <RefreshCw size={16} />
                  </button>
                ) : null}
              </div>
            </article>
          ))}
      </div>
      {!assets.length && (
        <div className="empty-products">
          <span className="empty-icon">
            <ImagePlus size={27} />
          </span>
          <h3>Your next campaign starts here.</h3>
          <p>Generate your first visual, or approve campaign assets one at a time.</p>
        </div>
      )}
      <AICreditConsent open={!!mediaConsent} title={mediaConsent?.slot==='campaign'?'Generate the next campaign asset?':'Generate this asset?'} description={mediaConsent?.name||'Review this image or video before approving generation.'} cost={mediaConsent?.cost||0} included={unlimited?'Included with your access':undefined} onCancel={()=>setMediaConsent(null)} onConfirm={()=>{if(mediaConsent?.slot==='campaign')void campaign(true);else if(mediaConsent?.slot==='single')void generate(true);}}><p>Only this asset will be generated. Nothing is published or sent.</p></AICreditConsent>
    </div>
  );
}
export function ProductFiles({ product }: { product: Product }) {
  const files = product.content.files || [];
  return (
    <div className="product-files panel">
      <div className="panel-heading">
        <div>
          <h2>The complete package</h2>
          <p>Practical resources generated specifically for this product.</p>
        </div>
        <a
          href={`/api/products/${product.id}/bundle`}
          className="button primary"
        >
          <ArrowDownToLine size={16} />
          Download bundle
        </a>
      </div>
      <div className="file-list">
        {files.map((f, i) => (
          <div className="file-row" key={f.name}>
            <span className="file-extension">{f.name.split(".").at(-1)}</span>
            <div>
              <strong>{f.name}</strong>
              <p>{f.description}</p>
            </div>
            <a
              className="icon-button"
              href={`/api/products/${product.id}/files/${i}`}
              aria-label={`Download ${f.name}`}
            >
              <ArrowDownToLine size={17} />
            </a>
          </div>
        ))}
      </div>
      {!files.length && (
        <div className="empty-products">
          <Layers3 size={28} />
          <h3>Your supporting files will appear here.</h3>
          <p>
            Finish AI generation to get your tailored templates, tools, and
            resources.
          </p>
        </div>
      )}
      <div className="file-safety-note">
        Generated files download to your device. Code and calculators should be
        reviewed before use.
      </div>
    </div>
  );
}
