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
import type { Product } from "@/lib/product";
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
  connected: { openai: boolean; anthropic: boolean; fal: boolean };
  secure: boolean;
};
export function AIProviders({
  signedIn,
  onUpdate,
}: {
  signedIn: boolean;
  onUpdate: () => void;
}) {
  const [s, setS] = useState<Settings>({
    config: {
      textProvider: "openai",
      textModel: "gpt-5.4",
      imageModel: "fal-ai/flux-pro/v1.1-ultra",
      videoModel: "fal-ai/kling-video/v2.6/pro/text-to-video",
    },
    connected: { openai: false, anthropic: false, fal: false },
    secure: false,
  });
  const [keys, setKeys] = useState({ openai: "", anthropic: "", fal: "" });
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    if (!signedIn) return;
    try {
      setS(await request<Settings>("/api/providers"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [signedIn]);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(remove?: "openai" | "anthropic" | "fal") {
    if (!signedIn) {
      location.href = "/signin-with-chatgpt?return_to=/";
      return;
    }
    setBusy(true);
    setError("");
    try {
      await request("/api/providers", "PUT", {
        config: s.config,
        ...keys,
        remove,
      });
      setKeys({ openai: "", anthropic: "", fal: "" });
      await load();
      onUpdate();
      toast.success(
        remove ? "Provider key removed" : "AI providers saved securely",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="ai-intro panel">
        <span className="ai-intro-icon">
          <Sparkles size={27} />
        </span>
        <div>
          <h2>Your intelligence. Your creative team.</h2>
          <p>
            Connect the models you trust. FiveGen turns them into one
            product-making workflow.
          </p>
        </div>
        <span className="secure-badge">
          <LockKeyhole size={13} />
          Encrypted key storage
        </span>
      </section>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="provider-grid">
        <section className="panel provider-card">
          <div className="provider-card-top">
            <span className="provider-number">01</span>
            <span className="eyebrow">THE THINKING & WRITING</span>
          </div>
          <h2>Product intelligence</h2>
          <p>
            Strategy, complete product content, useful files, sales pages,
            launch emails, and social campaigns.
          </p>
          <div className="form-stack">
            <label>
              Content provider
              <Select
                value={s.config.textProvider}
                onValueChange={(v) =>
                  setS({
                    ...s,
                    config: {
                      ...s.config,
                      textProvider: v as "openai" | "anthropic",
                      textModel:
                        v === "openai" ? "gpt-5.4" : "claude-sonnet-4-6",
                    },
                  })
                }
              >
                <SelectTrigger className="provider-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic · Claude</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label>
              Model
              <input
                value={s.config.textModel}
                onChange={(e) =>
                  setS({
                    ...s,
                    config: { ...s.config, textModel: e.target.value },
                  })
                }
              />
              <small>
                Use a model available to your API account. You can change this
                at any time.
              </small>
            </label>
            {(["openai", "anthropic"] as const).map((p) => (
              <div className="key-field" key={p}>
                <label>
                  {p === "openai" ? "OpenAI" : "Anthropic"} API key{" "}
                  <span
                    className={s.connected[p] ? "key-connected" : "key-empty"}
                  >
                    {s.connected[p] ? "Saved" : "Not connected"}
                  </span>
                  <div className="key-input">
                    <input
                      autoComplete="new-password"
                      type={show ? "text" : "password"}
                      placeholder={
                        s.connected[p]
                          ? "Enter a new key to replace the saved key"
                          : p === "openai"
                            ? "sk-…"
                            : "sk-ant-…"
                      }
                      value={keys[p]}
                      onChange={(e) =>
                        setKeys({ ...keys, [p]: e.target.value })
                      }
                    />
                    <button
                      aria-label={show ? "Hide keys" : "Show keys"}
                      onClick={() => setShow(!show)}
                    >
                      {show ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>
                {s.connected[p] && (
                  <button
                    className="remove-key"
                    disabled={busy}
                    onClick={() => void save(p)}
                  >
                    Remove saved key
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
        <section className="panel provider-card">
          <div className="provider-card-top">
            <span className="provider-number">02</span>
            <span className="eyebrow">THE LOOK & THE MOTION</span>
          </div>
          <h2>Image & video studio</h2>
          <p>
            Original campaign visuals, product images, and short promotional
            videos through fal.ai.
          </p>
          <div className="media-provider-summary">
            <div>
              <span className="type-icon purple">
                <ImagePlus size={21} />
              </span>
              <div>
                <strong>FLUX 1.1 Pro Ultra</strong>
                <small>High-resolution campaign images</small>
              </div>
            </div>
            <div>
              <span className="type-icon peach">
                <Film size={21} />
              </span>
              <div>
                <strong>Kling 2.6 Pro</strong>
                <small>5-second video clips with generated audio</small>
              </div>
            </div>
          </div>
          <label>
            fal.ai API key{" "}
            <span className={s.connected.fal ? "key-connected" : "key-empty"}>
              {s.connected.fal ? "Saved" : "Not connected"}
            </span>
            <div className="key-input">
              <input
                autoComplete="new-password"
                type={show ? "text" : "password"}
                placeholder={
                  s.connected.fal
                    ? "Enter a new key to replace the saved key"
                    : "Paste your fal.ai API key"
                }
                value={keys.fal}
                onChange={(e) => setKeys({ ...keys, fal: e.target.value })}
              />
              <button
                aria-label={show ? "Hide key" : "Show key"}
                onClick={() => setShow(!show)}
              >
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          {s.connected.fal && (
            <button
              className="remove-key"
              disabled={busy}
              onClick={() => void save("fal")}
            >
              Remove saved key
            </button>
          )}
          <div className="provider-note">
            <ShieldCheck size={20} />
            <p>
              Keys are encrypted before storage and used only by the server.
              Generation uses your provider account’s credits.
            </p>
          </div>
          <a
            className="text-link"
            href="https://fal.ai/dashboard/keys"
            target="_blank"
            rel="noreferrer"
          >
            Get your fal.ai key
            <ArrowRight size={14} />
          </a>
        </section>
      </div>
      <div className="provider-save-bar">
        <span>
          <KeyRound size={16} />
          Your saved keys are never sent back to the browser.
        </span>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? <Loader2 className="spin" size={16} /> : <Check size={16} />}
          Save AI providers
        </button>
      </div>
    </>
  );
}
type Job = {
  stage: number;
  status: string;
  error?: string;
  updated_at: number;
};
export function GenerationProgress({
  product,
  onProduct,
  onComplete,
}: {
  product: Product;
  onProduct: (p: Product) => void;
  onComplete: () => void;
}) {
  const [job, setJob] = useState<Job | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  const stop = useRef(false);
  const inProgress = useRef(false);
  const productRef = useRef(product);
  productRef.current = product;
  async function run() {
    if (inProgress.current) return;
    inProgress.current = true;
    stop.current = false;
    setRunning(true);
    setError("");
    try {
      let done = false;
      while (!done && !stop.current && mounted.current) {
        const d = await request<{
          product: Product;
          done: boolean;
          stage: number;
          total: number;
        }>(`/api/products/${product.id}/generate`, "POST", {});
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
    void request<{ job: Job | null }>(`/api/products/${product.id}/generate`)
      .then((d) => {
        if (!mounted.current) return;
        setJob(d.job);
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
                  : "Take this product further with AI."}
          </strong>
          <p>
            {completed
              ? "Review your content, explore your supporting files, and generate your marketing visuals."
              : running
                ? "Each completed step is saved. You can pause after the current step."
                : "Create complete content and a launch campaign using your connected provider."}
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
              <button className="button primary" onClick={() => void run()}>
                <Play size={14} />
                {job ? "Resume generation" : "Generate with AI"}
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
export function MediaStudio({ product }: { product: Product }) {
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
    <div className="media-studio">
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
              <small>Uses your fal.ai credits</small>
            </span>
            <button
              className="button primary"
              disabled={busy || prompt.length < 15}
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
          <h3>A whole campaign, in one go.</h3>
          <p>
            A square post, a story creative, a website banner, and a 5-second
            promo video.
          </p>
        </div>
        <button
          className="button dark"
          disabled={busy}
          onClick={() => void campaign()}
        >
          <WandSparkles size={16} />
          Generate campaign
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
