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
import type {CreditBalance} from "@/lib/credit-policy";
import type { ProviderConfig } from "@/lib/ai";
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
  const d = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(d.error || "Please try again.");
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
  async function load(){if(!signedIn)return;try{const settings=await request<Settings>("/api/providers");setS(settings);if(settings.admin)setMetrics(await request("/api/admin"));}catch(e){setError((e as Error).message);}}
  useEffect(()=>{void load();},[signedIn]);
  async function save(remove?:"openai"|"anthropic"|"fal"|"resend"){if(!s)return;setBusy(true);setError("");try{await request("/api/providers","PUT",{config:s.config,...keys,remove});setKeys({openai:"",anthropic:"",fal:"",resend:""});await load();onUpdate();toast.success("Platform AI settings saved");}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <>{s?.admin&&<a href="#platform-ai" className="button secondary"><ShieldCheck size={16}/>Manage platform AI</a>}<CreditsPanel signedIn={signedIn}/>{error&&<p className="error-banner" role="alert">{error}</p>}{s?.admin&&<section id="platform-ai" className="panel admin-ai"><div className="panel-heading"><div><span className="eyebrow">SUPER ADMIN ONLY</span><h2>Platform AI & revenue</h2><p>Master credentials power all customer accounts. Keys are encrypted and never returned to the browser.</p></div><ShieldCheck size={24}/></div>
    <div className="credit-balances">{[["Sales commissions",metrics?money(metrics.fees):"—"],["Credit sales",metrics?money(metrics.creditSales):"—"]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong><small>Recorded gross receipts · before refunds and costs</small></div>)}</div>
    <div className="form-two"><label>Content provider<Select value={s.config.textProvider} onValueChange={v=>setS({...s,config:{...s.config,textProvider:v as "openai"|"anthropic",textModel:v==="openai"?"gpt-4.1-mini":"claude-haiku-4-5"}})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="openai">OpenAI · GPT-4.1 mini · 10 credits/step</SelectItem><SelectItem value="anthropic">Anthropic · Haiku 4.5 · 30 credits/step</SelectItem></SelectContent></Select></label><label>Daily AI spending cap · USD<input type="number" min={1} max={10000} value={s.config.dailyBudget} onChange={e=>setS({...s,config:{...s.config,dailyBudget:Number(e.target.value)}})}/></label></div>
    <p className="field-help">Today’s conservative cost reservations: $ {metrics?.todayBudgetUsed.toFixed(2)||"0.00"}. This cap includes failed calls and protects platform spending; reconcile actual usage with provider invoices.</p>
    <div className="admin-key-grid">{(["openai","anthropic","fal","resend"] as const).map(key=><label key={key}>{key==="resend"?"Resend email key":key==="fal"?"fal.ai master key":key==="openai"?"OpenAI master key":"Anthropic master key"}<span className="field-help">{s.connected[key]?"Connected · leave blank to keep":"Not connected"}</span><input type="password" autoComplete="new-password" value={keys[key]} placeholder="Paste master API key" onChange={e=>setKeys({...keys,[key]:e.target.value})}/>{s.connected[key]&&<button className="text-link" disabled={busy} onClick={()=>void save(key)}>Remove stored key</button>}</label>)}</div>
    <label>Invitation & booking sender email<input type="email" value={s.config.emailFrom||""} placeholder="hello@fivegen.ai" onChange={e=>setS({...s,config:{...s.config,emailFrom:e.target.value}})}/><small>Verify this sender’s domain in Resend. Invitations only send when an owner chooses Send invitation.</small></label><label className="admin-pause"><input type="checkbox" checked={s.config.paused} onChange={e=>setS({...s,config:{...s.config,paused:e.target.checked}})}/>Pause all new AI generation</label>
    <button className="button primary" disabled={busy||!s.secure} onClick={()=>void save()}>{busy?<Loader2 className="spin" size={16}/>:<ShieldCheck size={16}/>}Save platform settings</button>{!s.secure&&<p className="field-help">Encrypted credential storage needs to be configured on the server.</p>}
    <details className="credit-history"><summary>Credit pricing and capacity</summary><p>One-time packs: $15 for 1,000 credits, $35 for 2,500, or $75 for 6,000. Three complete AI product runs per account are included each UTC month. The daily AI spending cap applies to all generation; monitor usage and provider costs as your audience grows.</p><p>There are no paid platform plans. Images, videos, and individual rewrites use purchased credits. AI products beyond the monthly allowance use credits per completed step.</p></details>
  </section>}</>;
}
type Job = {
  stage: number;
  status: string;
  error?: string;
  updated_at: number;
};
export function GenerationProgress({
  textCost=10,
  product,
  onProduct,
  onComplete,
  aiReady,
  onSetup,
  onBeforeGenerate,
  onRunningChange,
}: {
  textCost?:number;
  product: Product;
  onProduct: (p: Product) => void;
  onComplete: () => void;
  aiReady: boolean;
  onSetup: () => void;
  onBeforeGenerate: () => Promise<boolean>;
  onRunningChange: (running: boolean) => void;
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
  const [creditConfirm,setCreditConfirm]=useState(false),[confirmedCost,setConfirmedCost]=useState(textCost),[allowance,setAllowance]=useState<{remaining:number}|null>(null),[paymentMode,setPaymentMode]=useState<string|null>(null);
  async function run(allowCredits=false) {
    if (inProgress.current) return;
    if (!aiReady) { onSetup(); return; }
    inProgress.current = true;
    try {
      const status=await request<{mode:string|null;allowance:{remaining:number}}>(`/api/products/${product.id}/generate`);
      setAllowance(status.allowance);setPaymentMode(status.mode);
      if(status.mode==='credits'||(status.mode!=='included'&&status.allowance.remaining===0)){
        if(!allowCredits){const pricing=await request<{costs:{text:number}}>('/api/credits');setConfirmedCost(pricing.costs.text);setCreditConfirm(true);return;}
      }
      if (!(await onBeforeGenerate())) return;
      stop.current = false;
      setRunning(true);
      setError("");
      let done = false;
      while (!done && !stop.current && mounted.current) {
        const d = await request<{
          product: Product;
          done: boolean;
          stage: number;
          total: number;
        }>(`/api/products/${product.id}/generate`, "POST", {allowCredits,maxStepCredits:confirmedCost});
        if (!mounted.current) break;
        onProduct(d.product);
        setJob({
          stage: d.stage,
          status: d.done ? "completed" : "queued",
          updated_at: Date.now(),
        });
        done = d.done;
        if (done) {
          toast.success(
            "Your product, supporting files, and launch kit are ready.",
          );
          onComplete();
        }
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
    void request<{ job: Job | null;mode:string|null;allowance:{remaining:number} }>(`/api/products/${product.id}/generate`)
      .then((d) => {
        if (!mounted.current) return;
        setJob(d.job);
        setAllowance(d.allowance);setPaymentMode(d.mode);
        // Only a newly created job starts automatically. Reopening a paused
        // or partially completed product always requires an explicit resume.
        if (d.job?.status === "queued" && d.job.stage === -1) void run();
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
                : aiReady ? paymentMode==='included' ? 'This complete product is included in your monthly allowance. Resume at no credit cost.' : allowance&&allowance.remaining>0 ? `${allowance.remaining} of 3 included AI products remaining this month. Images and videos use separate credits.` : `Your next AI product uses ${textCost} credits per step. Review the cost before starting.` : "Add your expertise here, or view your AI credits to generate a complete product."}
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
      <AlertDialog open={creditConfirm} onOpenChange={setCreditConfirm}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Create with your credits?</AlertDialogTitle><AlertDialogDescription>This generation uses {confirmedCost} credits per completed step, up to {confirmedCost*(job&&job.stage>=0?Math.max(0,product.content.sections.length+1-job.stage):32)} credits for the remaining product. Most full products take 5–12 steps; longer formats can take 32. You can pause between steps. Failed steps return credits, and images and videos are separate.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep editing myself</AlertDialogCancel><AlertDialogAction onClick={()=>void run(true)}>Use credits & generate</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
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
  const [mediaReady, setMediaReady] = useState<boolean | null>(null);
  const [balance,setBalance]=useState(0);
  useEffect(() => { void request<Settings>("/api/providers").then((settings) => {setMediaReady(settings.connected.fal&&!settings.config.paused);setBalance(settings.credits.media);}).catch(() => setMediaReady(false)); }, []);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [kind, setKind] = useState<"image" | "video">("image");
  const [aspect, setAspect] = useState("1:1");
  const [prompt, setPrompt] = useState(
    product.content.imagePrompt ||
      `Create a premium marketing image for "${product.title}". Audience: ${product.audience}. ${product.description}. Refined editorial art direction, confident typography, generous negative space, sophisticated ${product.color} accents.`,
  );
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const load = useCallback(async () => {
    try {
      const d = await request<{ assets: Asset[] }>(
        `/api/products/${product.id}/assets`,
      );
      setAssets(d.assets);
      const c=await request<{balance:CreditBalance}>("/api/credits");setBalance(c.balance.media);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [product.id]);
  useEffect(() => {
    void load();
  }, [load]);
  const sync = useCallback(async () => {
    const active = assets.filter((a) =>
      ["queued", "running"].includes(a.status),
    );
    if (!active.length) return;
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
    if (!assets.some((a) => ["queued", "running"].includes(a.status))) return;
    const timer = setTimeout(() => void sync(), 10000);
    return () => clearTimeout(timer);
  }, [assets, sync]);
  async function generate() {
    setBusy(true);
    setError("");
    try {
      await request(`/api/products/${product.id}/assets`, "POST", {
        kind,
        prompt,
        name: `${product.title} · ${kind === "image" ? "Campaign visual" : "Promo video"}`,
        aspect,
      });
      await load();
      toast.success("Your media job is in the queue.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function campaign() {
    if(balance<196){setError("This campaign needs 196 credits. Add credits first.");return;}
    setBusy(true);
    setError("");
    try {
      const imagePrompt = product.content.imagePrompt || prompt;
      for (const [i, a] of ["1:1", "9:16", "16:9"].entries())
        await request(`/api/products/${product.id}/assets`, "POST", {
          kind: "image",
          prompt: imagePrompt,
          name: ["Social square", "Story creative", "Website banner"][i],
          aspect: a,
        });
      await request(`/api/products/${product.id}/assets`, "POST", {
        kind: "video",
        prompt:
          product.content.videoPrompt ||
          `Cinematic 5-second product promo for ${product.title}. ${product.description}. Clean modern studio, slow camera push, polished lighting, subtle music.`,
        name: "Launch video",
        aspect: "9:16",
      });
      toast.success("Your campaign is queued: 3 images and 1 video.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      await load();
      setBusy(false);
    }
  }
  return (
    <div className="media-studio"><div className="media-credit-bar"><span><Sparkles size={16}/> {balance.toLocaleString()} image/video credits</span><button className="button secondary" onClick={onSetup}>Add credits <ArrowRight size={15}/></button></div>
      {mediaReady === false && <div className="checkout-setup media-setup"><ImagePlus size={21}/><div><strong>Your FiveGen media studio</strong><p>Image and video generation opens when the administrator connects the platform AI. Your product stays saved.</p></div><button className="button primary" onClick={onSetup}>View AI & credits <ArrowRight size={15}/></button></div>}
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
                ? "FLUX 1.1 Pro Ultra"
                : "Kling 2.6 Pro · 5 seconds"}
              <small>{kind === "image" ? "12 credits per image" : "160 credits · includes audio"}</small>
            </span>
            <button
              className="button primary"
              disabled={busy || prompt.length < 15 || !mediaReady || balance<(kind==="image"?12:160)}
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
          <h3>A whole campaign · 196 credits.</h3>
          <p>
            A square post, a story creative, a website banner, and a 5-second
            promo video.
          </p>
        </div>
        <button
          className="button dark"
          disabled={busy || mediaReady === null}
          onClick={() => mediaReady ? void campaign() : onSetup()}
        >
          <WandSparkles size={16} />
          {mediaReady === false ? "AI status & credits" : "Generate campaign · 196 credits"}
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
          <p>Generate your first visual or let AI build the full campaign.</p>
        </div>
      )}
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
