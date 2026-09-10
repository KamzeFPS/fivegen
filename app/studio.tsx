"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Crown,
  ExternalLink,
  Eye,
  FileText,
  Globe,
  LayoutDashboard,
  Layers3,
  Link2,
  Loader2,
  MoreHorizontal,
  MousePointer2,
  Package,
  Plus,
  Search,
  Settings2,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Users,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  AIProviders,
  GenerationProgress,
  MediaStudio,
  ProductFiles,
} from "./ai-components";
import { Brand, Cover } from "./ui-brand";
import { CreateProductFlow, GrowingTextarea, ProductPreview, PublishReview } from "./product-flow";
import { BillingPage, SalesTools } from "./sales-tools";
import { freePlan, type PlanInfo } from "@/lib/plans";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription } from "@/components/ui/alert-dialog";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  blueprint,
  colors,
  formats,
  money,
  templates,
  type Brief,
  type Order,
  type Product,
} from "@/lib/product";

type View =
  | "Overview"
  | "My products"
  | "Templates"
  | "Analytics"
  | "Customers"
  | "Payments"
  | "Settings"
  | "Plan & billing"
  | "AI & credits";
type Workspace = {
  plan: PlanInfo;
  admin?:boolean; textCost?:number;
  products: Product[];
  orders: Order[];
  visits: { createdAt: number }[];
  settings: { name: string; stripeAccount: string | null };
  capabilities: { ai: boolean; stripe: boolean; domain: string | null };
  stripeReady?: boolean;
};
const empty: Workspace = {
  plan: freePlan,
  products: [],
  orders: [],
  visits: [],
  settings: { name: "My studio", stripeAccount: null },
  capabilities: { ai: false, stripe: false, domain: null },
};
const nav = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "My products", icon: Layers3 },
  { name: "Templates", icon: WandSparkles },
  { name: "Analytics", icon: TrendingUp },
  { name: "Customers", icon: Users },
] as const;
const sampleOrders: Order[] = [
  {
    id: "example-1",
    productId: "0",
    email: "olivia@example.com",
    amount: 4900,
    provider: "stripe",
    createdAt: Date.UTC(2026, 8, 10, 14, 0) - 120000,
    title: "The Creator Launch Kit",
  },
  {
    id: "example-2",
    productId: "1",
    email: "james@example.com",
    amount: 7900,
    provider: "whop",
    createdAt: Date.UTC(2026, 8, 10, 14, 0) - 1800000,
    title: "Build Your Personal Brand",
  },
  {
    id: "example-3",
    productId: "2",
    email: "emma@example.com",
    amount: 2900,
    provider: "stripe",
    createdAt: Date.UTC(2026, 8, 10, 14, 0) - 3600000,
    title: "The Notion Productivity OS",
  },
];
async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(d.error || "Please try again.");
  return d;
}
function downloadText(name: string, text: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function StudioSidebar({ children }: { children: React.ReactNode }) {
  const { setOpenMobile } = useSidebar();
  return <Sidebar className="folio-sidebar"><div style={{ display: "contents" }} onClick={(event) => {
    if (event.target instanceof Element && event.target.closest("button, a")) setOpenMobile(false);
  }}>{children}</div></Sidebar>;
}

export default function Studio({
  user,
}: {
  user: { name: string; email: string } | null;
}) {
  const [view, setView] = useState<View>("Overview");
  const [workspace, setWorkspace] = useState<Workspace>(empty);
  const [demo, setDemo] = useState(!user);
  const [loading, setLoading] = useState(!!user);
  const [error, setError] = useState("");
  const [period, setPeriod] = useState("30");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [create, setCreate] = useState(false);
  const [quickIdea, setQuickIdea] = useState("");
  const [quickFormat, setQuickFormat] = useState<Brief["format"]>("Guide");
  const [brief, setBrief] = useState<Brief>({
    ...templates[0],
    title: "",
    description: "",
    audience: "",
  });
  const [revision, setRevision] = useState("");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<Product | null>(null);
  const [editTab, setEditTab] = useState("content");
  const [section, setSection] = useState(0);
  const [publish, setPublish] = useState<Product | null>(null);
  const [help, setHelp] = useState(false);
  const [settingsName, setSettingsName] = useState("My studio");
  const [editorBaseline, setEditorBaseline] = useState("");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [preview, setPreview] = useState(false);
  const [publishReview, setPublishReview] = useState(false);
  const [creationError, setCreationError] = useState("");
  const [resumeBrief, setResumeBrief] = useState(false);
  const [returnProduct, setReturnProduct] = useState<Product | null>(null);
  const [generating, setGenerating] = useState(false);
  const dirty = !!editor && !!editorBaseline && JSON.stringify(editor) !== editorBaseline;
  useEffect(() => {
    if (!dirty) return;
    const protectEdits = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protectEdits);
    return () => window.removeEventListener("beforeunload", protectEdits);
  }, [dirty]);
  function receiveProduct(product: Product) {
    setEditor(product);
    setEditorBaseline(JSON.stringify(product));
  }
  function openEditor(product: Product) {
    receiveProduct(product);
    setSection(0);
    setEditTab("content");
    setView("My products");
  }
  function guardNavigation(action: () => void) {
    if (dirty) setPendingAction(() => action);
    else action();
  }
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view, editor?.id]);
  const reload = useCallback(async () => {
    if (!user) return;
    setError("");
    try {
      const d = await api<Workspace>("/api/workspace");
      setWorkspace(d);
      setSettingsName(d.settings.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user]);
  useEffect(() => {
    void reload();
  }, [reload]);
  useEffect(() => {
    if (user) {
      const draft = sessionStorage.getItem("folio-unsaved-brief");
      if (draft) {
        try {
          setBrief(JSON.parse(draft));
          setStep(2);
          const destination = sessionStorage.getItem("fivegen-brief-destination");
          if (destination === "AI & credits") { setView("AI & credits"); setResumeBrief(true); }
          else setCreate(true);
        } catch {}
        sessionStorage.removeItem("folio-unsaved-brief");
        sessionStorage.removeItem("fivegen-brief-destination");
      }
    }
    if (new URLSearchParams(location.search).has("stripe")) setView("Payments");
    if (new URLSearchParams(location.search).has("billing")) setView("Plan & billing");
  }, [user]);
  const commitNavigation = (v: View) => {
    setView(v);
    setSearch("");
    setFilter("all");
    setEditor(null);
  };
  const navigate = (v: View) => guardNavigation(() => commitNavigation(v));
  async function setupFromEditor(view: "AI & credits" | "Payments") {
    if (!editor) return;
    const product = dirty ? await save(editor) : editor;
    if (!product) return;
    setReturnProduct(product);
    setPublishReview(false);
    commitNavigation(view);
  }
  const requireUser = () => {
    if (user) return true;
    window.location.href = "/signin-with-chatgpt?return_to=/";
    return false;
  };
  function startCreate(t?: Brief) {
    if(user && workspace.plan.used>=workspace.plan.limit){navigate("Plan & billing");toast.info("You’ve reached your plan’s product limit.");return;}
    guardNavigation(() => {
    setCreationError("");
    if (!t && (brief.title || brief.description || brief.audience)) {
      setStep(1);
      setCreate(true);
      return;
    }
    setBrief(
      t
        ? { ...t, language: "English", quality: "premium" }
        : {
            ...templates[0],
            title: "",
            description: "",
            audience: "",
            language: "English",
            quality: "premium",
          },
    );
    setStep(0);
    setCreate(true);
    });
  }
  async function generate() {
    if (!user) {
      sessionStorage.setItem("folio-unsaved-brief", JSON.stringify(brief));
      sessionStorage.removeItem("fivegen-brief-destination");
    }
    if (!requireUser()) return;
    setBusy(true);
    setCreationError("");
    try {
      const p = await api<{ product: Product; mode: string }>(
        "/api/products",
        "POST",
        brief,
      );
      setCreate(false);
      receiveProduct(p.product);
      setBrief({ ...templates[0], title: "", description: "", audience: "" });
      setQuickIdea("");
      setResumeBrief(false);
      setSection(0);
      setEditTab("content");
      setView("My products");
      setDemo(false);
      await reload();
      toast.success(
        p.mode === "ai"
          ? "Your AI production workflow is starting."
          : "Your editable starter is ready. FiveGen AI is being configured. You can edit your draft now.",
      );
    } catch (e) {
      setCreationError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(p: Product) {
    setBusy(true);
    try {
      const r = await api<{ product: Product }>(
        `/api/products/${p.id}`,
        "PATCH",
        p,
      );
      receiveProduct(r.product);
      await reload();
      toast.success("Changes saved");
      return r.product;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function publishProduct(p: Product) {
    setBusy(true);
    try {
      const r = await api<{ product: Product }>(
        `/api/products/${p.id}`,
        "PATCH",
        { ...p, status: "published" },
      );
      receiveProduct(r.product);
      setPublishReview(false);
      setPublish(r.product);
      await reload();
      toast.success("Your product page is published");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copyLink(p: Product) {
    try {
      await navigator.clipboard.writeText(`${location.origin}/p/${p.slug}`);
      toast.success("Product link copied");
    } catch {
      toast.error(
        "Could not copy. Open the product page and copy its address.",
      );
    }
  }
  async function exportEditor(kind: "bundle" | "export") {
    if (!editor) return;
    const product = dirty ? await save(editor) : editor;
    if (!product) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/products/${product.id}/${kind}`);
      if (!response.ok) throw new Error("Could not export this product. Please try again.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${product.slug}${kind === "bundle" ? "-complete-package.zip" : ".html"}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast.success("Download started");
    } catch (error) { toast.error((error as Error).message); }
    finally { setBusy(false); }
  }
  const cutoff = Date.now() - Number(period) * 86400000;
  const orders = demo
    ? sampleOrders
    : workspace.orders.filter((o) => o.createdAt >= cutoff);
  const revenue = demo
    ? period === "7"
      ? 428900
      : period === "90"
        ? 3241600
        : 1284500
    : orders.reduce((a, o) => a + o.amount, 0);
  const visits = demo
    ? period === "7"
      ? 1234
      : period === "90"
        ? 18241
        : 6842
    : workspace.visits.filter((v) => v.createdAt >= cutoff).length;
  const sales = demo
    ? period === "7"
      ? 87
      : period === "90"
        ? 652
        : 248
    : orders.filter((o) => o.amount > 0).length;
  const chartData = useMemo(() => {
    const n = Number(period);
    const count = n === 7 ? 7 : Math.min(n, 15);
    return Array.from({ length: count }, (_, i) => {
      const start = Date.now() - n * 86400000 + (n / count) * i * 86400000;
      const end = start + (n / count) * 86400000;
      return {
        label: new Date(start).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        revenue: demo
          ? [
              240, 440, 370, 690, 580, 740, 630, 980, 820, 1120, 980, 1380,
              1270, 1570, 1760,
            ][i] * (n === 7 ? 0.65 : 1)
          : orders
              .filter((o) => o.createdAt >= start && o.createdAt < end)
              .reduce((a, o) => a + o.amount / 100, 0),
      };
    });
  }, [demo, period, workspace.orders]);
  const displayProducts = demo
    ? templates
        .slice(0, 3)
        .map(
          (b, i) =>
            ({
              ...b,
              id: `sample-${i}`,
              slug: "",
              status: "published",
              content: blueprint(b),
              createdAt: 0,
              updatedAt: 0,
            }) as Product,
        )
    : workspace.products;
  const filtered = displayProducts.filter(
    (p) =>
      (filter === "all" || p.status === filter) &&
      `${p.title} ${p.format}`.toLowerCase().includes(search.toLowerCase()),
  );
  const selectedTemplates = templates.filter(
    (t) =>
      (filter === "all" || t.format === filter) &&
      `${t.title} ${t.audience}`.toLowerCase().includes(search.toLowerCase()),
  );
  const exportSales = () => {
    const cells = (v: unknown) =>
      '"' +
      String(v)
        .replace(/"/g, '""')
        .replace(/^[=+@-]/, "'") +
      '"';
    downloadText(
      `${demo ? "sample-" : ""}fivegen-sales.csv`,
      [
        ["Date", "Product", "Customer", "Gross amount (USD)", "Provider", "FiveGen fee (USD)", "After FiveGen fee, before processing (USD)"],
        ...orders.map((o) => [
          new Date(o.createdAt).toISOString(),
          o.title || "",
          o.email,
          (o.amount / 100).toFixed(2),
          o.provider,
          ((o.platformFee||0)/100).toFixed(2),
          ((o.amount-(o.platformFee||0))/100).toFixed(2),
        ]),
      ]
        .map((r) => r.map(cells).join(","))
        .join("\n"),
      "text/csv",
    );
    toast.success("Sales report exported");
  };
  const productCards = (items: Product[]) => (
    <div className="products-grid">
      {items.map((p, i) => (
        <article className="product-card" key={p.id}>
          <button
            className="cover-button"
            onClick={() =>
              demo
                ? startCreate(templates[i])
                : openEditor(p)
            }
            aria-label={`Edit ${p.title}`}
          >
            <Cover product={p} />
          </button>
          <div className="product-card-body">
            <div className="row-between">
              <span className={`status ${p.status}`}>
                <i />
                {demo
                  ? "Example product"
                  : p.status === "published"
                    ? "Published"
                    : "Draft"}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="icon-button"
                    aria-label={`Options for ${p.title}`}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() =>
                      demo
                        ? startCreate(templates[i])
                        : openEditor(p)
                    }
                  >
                    Edit product
                  </DropdownMenuItem>
                  {!demo && p.status === "published" && (
                    <>
                      <DropdownMenuItem
                        onClick={() => window.open(`/p/${p.slug}`, "_blank")}
                      >
                        View storefront
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void copyLink(p)}>
                        Copy link
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <h3>{p.title}</h3>
            <div className="row-between product-meta">
              <span>{p.format}</span>
              <strong>{money(p.price * 100)}</strong>
            </div>
            <div className="product-stats">
              <span>
                {demo
                  ? [128, 76, 44][i]
                  : workspace.orders.filter((o) => o.productId === p.id)
                      .length}{" "}
                sales
              </span>
              <span>
                {money(
                  demo
                    ? [627200, 600400, 127600][i]
                    : workspace.orders
                        .filter((o) => o.productId === p.id)
                        .reduce((s, o) => s + o.amount, 0),
                )}{" "}
                <small>revenue</small>
              </span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "224px" } as React.CSSProperties}
    >
      <StudioSidebar>
        <SidebarHeader className="sidebar-head">
          <button className="brand-home" aria-label="FiveGen studio home" onClick={() => navigate("Overview")}><Brand /></button>
          <button
            className="workspace-switch"
            onClick={() => navigate("Settings")}
          >
            <span className="workspace-avatar">S</span>
            <span>
              <strong>{workspace.settings.name}</strong>
              <small>Creator workspace</small>
            </span>
            <ChevronDown size={15} />
          </button>
          <button
            className="button primary new-product"
            onClick={() => startCreate()}
          >
            <Plus size={17} />
            Create a product
          </button>
        </SidebarHeader>
        <SidebarContent>
          <div className="nav-label">WORKSPACE</div>
          <SidebarMenu className="main-menu">
            {nav.map(({ name, icon: Icon }) => (
              <SidebarMenuItem key={name}>
                <SidebarMenuButton
                  isActive={view === name}
                  onClick={() => navigate(name)}
                  className="nav-button"
                >
                  <Icon size={19} />
                  <span>{name === "Overview" ? "Studio" : name}</span>
                  {name === "My products" && (
                    <span className="nav-count">
                      {demo ? 3 : workspace.products.length}
                    </span>
                  )}
                  {name === "Templates" && (
                    <span className="tiny-tag">NEW</span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <div className="nav-label second">MANAGE</div>
          <SidebarMenu className="main-menu">
            {(
              [
                { name: "Payments", icon: CreditCard },
                { name: "AI & credits", icon: Sparkles },
                { name: "Plan & billing", icon: Crown },
                { name: "Settings", icon: Settings2 },
              ] as const
            ).map(({ name, icon: Icon }) => (
              <SidebarMenuItem key={name}>
                <SidebarMenuButton
                  className="nav-button"
                  isActive={view === name}
                  onClick={() => navigate(name)}
                >
                  <Icon size={19} />
                  <span>{name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="sidebar-footer">
          <button className="help-link" onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
            Help & getting started
            <ArrowUpRight size={15} />
          </button>
          <button
            className="profile"
            onClick={() => (user ? navigate("Settings") : requireUser())}
          >
            <span className="profile-avatar">
              {user?.name?.[0]?.toUpperCase() || "Y"}
            </span>
            <span>
              <strong>
                {user?.name?.includes("@")
                  ? user.name.split("@")[0]
                  : user?.name || "Your workspace"}
              </strong>
              <small>{user ? "Personal account" : "Sign in to create"}</small>
            </span>
            <ChevronDown size={15} />
          </button>
        </SidebarFooter>
      </StudioSidebar>
      <SidebarInset className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <SidebarTrigger className="mobile-menu" />
            <span>FiveGen Studio</span>
            <ChevronRight size={13} />
            <strong>{editor ? "Product editor" : view === "Overview" ? "Create & manage" : view}</strong>
          </div>
          <div className="topbar-actions">
            <span className="sample-switch">
              <Switch
                id="sample-data"
                checked={demo}
                onCheckedChange={setDemo}
              />
              <label htmlFor="sample-data">Sample data</label>
            </span>
            <span className="header-divider" />
            <button
              className="icon-button"
              onClick={() => setHelp(true)}
              aria-label="Help"
            >
              <CircleHelp size={19} />
            </button>
            <span className="small-avatar">
              {user?.name?.[0]?.toUpperCase() || "Y"}
            </span>
          </div>
        </header>
        <main className={`workspace-main ${view === "Overview" && !editor ? "studio-home" : ""}`} key={editor?.id || view}>
          {!editor && (returnProduct || resumeBrief) && <div className="resume-work"><div><strong>{returnProduct ? returnProduct.title : "Your product brief is ready"}</strong><span>Continue where you left off after setup.</span></div><button className="button secondary" onClick={() => { if(returnProduct) { openEditor(returnProduct); setReturnProduct(null); } else { setStep(2); setCreate(true); } }}><ArrowLeft size={16}/>{returnProduct ? "Back to product" : "Resume creation"}</button></div>}
          {error && (
            <div role="alert" className="error-banner">
              {error}
              <button onClick={() => void reload()}>Try again</button>
            </div>
          )}
          {editor ? (
            <>
              <div className="editor-commandbar">
                <div className="editor-identity"><button className="back-link" onClick={() => navigate("My products")}><ArrowLeft size={15} /> All products</button><h1>{editor.title}</h1><span className={dirty ? "save-state unsaved" : "save-state"}>{generating ? "AI is working…" : busy ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}</span></div>
                <div className="editor-actions">
                  <button className="button secondary" onClick={() => setPreview(true)}><Eye size={16} />Preview</button>
                  <DropdownMenu><DropdownMenuTrigger asChild><button className="button secondary" disabled={busy || generating}><ArrowDownToLine size={16} /><span>Export</span><ChevronDown size={14} /></button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => void exportEditor("bundle")}>Complete package · ZIP</DropdownMenuItem><DropdownMenuItem onClick={() => void exportEditor("export")}>Printable guide · HTML / PDF</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                  <button className="button secondary" disabled={busy || generating || !dirty} onClick={() => void save(editor)}><Check size={16} />Save</button>
                  <button className="button primary" disabled={busy || generating} onClick={() => setPublishReview(true)}><Globe size={16} />{editor.status === "published" ? "Publish changes" : "Publish"}</button>
                </div>
              </div>
              <GenerationProgress
                key={editor.id}
                product={editor}
                onProduct={receiveProduct}
                textCost={workspace.textCost||10}
                aiReady={workspace.capabilities.ai}
                onSetup={() => void setupFromEditor("AI & credits")}
                onBeforeGenerate={async () => !dirty || !!(await save(editor))}
                onRunningChange={setGenerating}
                onComplete={() => void reload()}
              />
              <Tabs value={editTab} onValueChange={setEditTab}>
                <TabsList className="editor-tabs">
                  <TabsTrigger value="content">1. Content</TabsTrigger>
                  <TabsTrigger value="storefront">
                    2. Storefront
                  </TabsTrigger>
                  <TabsTrigger value="sales">3. Sales & funnel</TabsTrigger>
                  <TabsTrigger value="launch">4. Launch kit</TabsTrigger>
                  <TabsTrigger value="files">5. Files</TabsTrigger>
                  <TabsTrigger value="media">6. Marketing</TabsTrigger>
                </TabsList>
              </Tabs>
              {editTab === "sales" ? <fieldset className="sales-tools-fieldset" disabled={busy||generating}><SalesTools product={editor} products={workspace.products} plan={workspace.plan} onChange={setEditor} onUpgrade={() => { guardNavigation(()=>{setReturnProduct(editor);commitNavigation("Plan & billing");}); }}/></fieldset> : editTab === "media" ? (
                <MediaStudio product={editor} onSetup={() => void setupFromEditor("AI & credits")} />
              ) : editTab === "files" ? (
                <ProductFiles product={editor} />
              ) : (
                <div className="editor-layout">
                  {" "}
                  <fieldset className="panel editor-panel" disabled={generating}>
                    {editTab === "content" ? (
                      <>
                        <div className="chapter-toolbar">
                          <div className="chapter-select"><label htmlFor="chapter-select">Section {section + 1} of {editor.content.sections.length}</label><Select value={String(section)} onValueChange={(value) => setSection(Number(value))}><SelectTrigger id="chapter-select"><SelectValue /></SelectTrigger><SelectContent>{editor.content.sections.map((item,index) => <SelectItem key={index} value={String(index)}>{index + 1}. {item.title}</SelectItem>)}</SelectContent></Select></div>
                          <div className="chapter-actions"><button className="icon-button" disabled={section === 0} aria-label="Previous section" onClick={() => setSection(section - 1)}><ArrowLeft size={17}/></button><button className="icon-button" disabled={section >= editor.content.sections.length - 1} aria-label="Next section" onClick={() => setSection(section + 1)}><ArrowRight size={17}/></button><button className="button secondary" disabled={generating || editor.content.sections.length >= 30} onClick={() => { setEditor({...editor, content:{...editor.content, sections:[...editor.content.sections,{title:"New section",body:"Add your knowledge here."}]}}); setSection(editor.content.sections.length); }}><Plus size={16}/><span>Add section</span></button></div>
                        </div>
                        <div className="content-editor">
                          <label>
                            Section title
                            <input
                              value={
                                editor.content.sections[section]?.title || ""
                              }
                              onChange={(e) =>
                                setEditor({
                                  ...editor,
                                  content: {
                                    ...editor.content,
                                    sections: editor.content.sections.map(
                                      (s, i) =>
                                        i === section
                                          ? { ...s, title: e.target.value }
                                          : s,
                                    ),
                                  },
                                })
                              }
                            />
                          </label>
                          <label>
                            Content
                            <GrowingTextarea
                              className="document-textarea"
                              value={
                                editor.content.sections[section]?.body || ""
                              }
                              onChange={(e) =>
                                setEditor({
                                  ...editor,
                                  content: {
                                    ...editor.content,
                                    sections: editor.content.sections.map(
                                      (s, i) =>
                                        i === section
                                          ? { ...s, body: e.target.value }
                                          : s,
                                    ),
                                  },
                                })
                              }
                            />
                          </label>
                          <div className="section-revision">
                            <label>
                              Refine this section with AI
                              <input
                                placeholder="e.g. Add a worked example and make the steps more practical"
                                value={revision}
                                onChange={(e) => setRevision(e.target.value)}
                              />
                            </label>
                            {!workspace.capabilities.ai && <button className="text-link" type="button" onClick={() => void setupFromEditor("AI & credits")}>View AI availability & credits <ArrowRight size={14}/></button>}
                            <button
                              className="button secondary"
                              disabled={busy || generating || revision.length < 8 || !workspace.capabilities.ai}
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  if (!(await save(editor))) return;
                                  setBusy(true);
                                  const d = await api<{ product: Product }>(
                                    `/api/products/${editor.id}/revise`,
                                    "POST",
                                    { index: section, instructions: revision },
                                  );
                                  receiveProduct(d.product);
                                  setRevision("");
                                  await reload();
                                  toast.success("Section improved");
                                } catch (e) {
                                  toast.error((e as Error).message);
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              <Sparkles size={15} />
                              Refine section · {workspace.textCost||10} credits
                            </button>
                          </div>

                        </div>
                      </>
                    ) : editTab === "storefront" ? (
                      <div className="form-stack">
                        <label>
                          Product name
                          <input
                            value={editor.title}
                            onChange={(e) =>
                              setEditor({ ...editor, title: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Short description
                          <textarea
                            value={editor.description}
                            onChange={(e) =>
                              setEditor({
                                ...editor,
                                description: e.target.value,
                              })
                            }
                          />
                        </label>
                        <div className="form-two">
                          <label>
                            Price in USD
                            <input
                              type="number"
                              min="0"
                              max="9999"
                              step="0.01"
                              value={editor.price}
                              onChange={(e) =>
                                setEditor({
                                  ...editor,
                                  price: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                          <label>
                            Product URL
                            <input
                              value={editor.slug}
                              onChange={(e) =>
                                setEditor({ ...editor, slug: e.target.value })
                              }
                            />
                          </label>
                        </div>
                        <div className="checkout-setup"><CreditCard size={20}/><div><strong>{workspace.stripeReady ? "Stripe checkout connected" : "Connect your checkout"}</strong><p>{workspace.stripeReady ? "Paid purchases unlock the product automatically." : "Connect Stripe to accept payments and automatically collect your plan’s commission."}</p></div><button type="button" className="button secondary" onClick={() => void setupFromEditor("Payments")}>{workspace.stripeReady ? "Manage" : "Connect Stripe"}<ArrowUpRight size={14}/></button></div>
                        <div className="sales-note">FiveGen commission: {workspace.plan.tier==="pro"?"3%":"10%"} of each paid sale, plus Stripe processing fees. Whop links are paused until tracked commission collection is available.</div>
                        <label>
                          What customers get
                          <textarea
                            value={editor.content.benefits.join("\n")}
                            onChange={(e) =>
                              setEditor({
                                ...editor,
                                content: {
                                  ...editor.content,
                                  benefits: e.target.value.split("\n"),
                                },
                              })
                            }
                          />
                          <small>One benefit per line.</small>
                        </label>
                        <div>
                          <span className="field-label">Cover color</span>
                          <div className="color-options">
                            {colors.map((c) => (
                              <button
                                key={c}
                                className={`color-option ${c} ${editor.color === c ? "selected" : ""}`}
                                aria-label={c}
                                onClick={() =>
                                  setEditor({ ...editor, color: c })
                                }
                              >
                                {editor.color === c && <Check size={17} />}
                              </button>
                            ))}
                          </div>
                        </div>
                        {editor.status === "published" && (
                          <button
                            className="button secondary"
                            disabled={busy}
                            onClick={async () => {
                              const p = await save({
                                ...editor,
                                status: "draft",
                              });
                              if (p) toast.success("Product unpublished");
                            }}
                          >
                            Unpublish product
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="form-stack">
                        <label>
                          Your 7-day launch plan & email
                          <GrowingTextarea
                            className="document-textarea"
                            value={editor.content.launch}
                            onChange={(e) =>
                              setEditor({
                                ...editor,
                                content: {
                                  ...editor.content,
                                  launch: e.target.value,
                                },
                              })
                            }
                          />
                        </label>
                        <button
                          className="button secondary"
                          onClick={() =>
                            downloadText(
                              `${editor.slug}-launch.txt`,
                              editor.content.launch,
                            )
                          }
                        >
                          <ArrowDownToLine size={16} />
                          Download launch kit
                        </button>
                      </div>
                    )}
                  </fieldset>
                  <aside className="editor-preview">
                    <span className="eyebrow">YOUR PRODUCT AT A GLANCE</span>
                    <Cover product={editor} large />
                    <div className="panel preview-details">
                      <h3>{editor.title}</h3>
                      <p>{editor.description}</p>
                      <div className="row-between">
                        <strong>{money(editor.price * 100)}</strong>
                        <span>{editor.content.sections.length} sections</span>
                      </div>
                      <button
                        className="button secondary full"
                        disabled={busy}
                        onClick={() => void exportEditor("bundle")}
                      >
                        <ArrowDownToLine size={16} />
                        Export product
                      </button>
                      {editor.status === "published" && (
                        <a
                          className="text-link"
                          href={`/p/${editor.slug}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View product page <ExternalLink size={14} />
                        </a>
                      )}
                      <small>
                        Export includes an HTML guide you can print to PDF.
                      </small>
                    </div>
                  </aside>
                </div>
              )}
              <div className="editor-step-footer"><span>{({content:"Review your content, then shape your storefront.",storefront:"Set a price and connect checkout before you share.",sales:"Save your offer and page settings before sharing.",launch:"Your campaign copy is ready to edit and export.",files:"Review what your customers will receive.",media:"Ready to share your product?"} as Record<string,string>)[editTab]}</span><button className="button primary" disabled={busy || generating} onClick={() => { const next=({content:"storefront",storefront:workspace.plan.tier==="pro"?"sales":"launch",sales:"launch",launch:"files",files:"media"} as Record<string,string>)[editTab]; if (next) { setEditTab(next); window.scrollTo({top:0,behavior:"instant"}); } else setPublishReview(true); }}>{({content:"Continue to storefront",storefront:workspace.plan.tier==="pro"?"Build your offer":"Continue to launch kit",sales:"Continue to launch kit",launch:"Review product files",files:"Open marketing studio",media:"Review & publish"} as Record<string,string>)[editTab]}<ArrowRight size={16}/></button></div>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">
                    {view === "Overview"
                      ? "FIVEGEN / CREATIVE WORKSPACE"
                      : view === "Templates"
                        ? "THE STARTING POINT"
                        : "YOUR CREATOR WORKSPACE"}
                  </div>
                  <h1>
                    {view === "Overview" ? (
                      <>
                        Your next creation starts here<span className="orange-text">.</span>
                      </>
                    ) : view === "Templates" ? (
                      "Find your starting point."
                    ) : (
                      view
                    )}
                  </h1>
                  <p>
                    {
                      {
                        Overview:
                          "Create the product. Build the campaign. Make it yours.",
                        "My products":
                          "Everything you’ve created, all in one place.",
                        Templates:
                          "Thoughtful starting points for your next great product.",
                        Analytics:
                          "A closer look at how your products are performing.",
                        Customers: "The people who believe in what you make.",
                        Payments: "Get paid for what you know.",
                        "Plan & billing": "The right tools for your next stage.",
                        Settings: "Make this space feel like yours.",
                        "AI & credits":
                          "Your credit balance, generation prices, and built-in AI.",
                      }[view]
                    }
                  </p>
                </div>
                <div className="heading-actions">
                  {["Overview", "Analytics", "Customers"].includes(view) ? (
                    <>
                      <Select value={period} onValueChange={setPeriod}>
                        <SelectTrigger className="period-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="7">Last 7 days</SelectItem>
                          <SelectItem value="30">Last 30 days</SelectItem>
                          <SelectItem value="90">Last 90 days</SelectItem>
                        </SelectContent>
                      </Select>
                      <button
                        className="button secondary export-button"
                        onClick={exportSales}
                      >
                        <ArrowDownToLine size={16} />
                        Export
                      </button>
                    </>
                  ) : view === "My products" ? (
                    <button
                      className="button primary"
                      onClick={() => startCreate()}
                    >
                      <Plus size={17} />
                      Create a product
                    </button>
                  ) : null}
                </div>
              </div>
              {demo && (
                <div className="demo-note">
                  <span>DEMO WORKSPACE</span>Sample products and sales. Your workspace starts fresh.
                  <button onClick={() => setDemo(false)}>
                    View my workspace <ArrowRight size={14} />
                  </button>
                </div>
              )}
              {loading && (
                <div className="loading-line">
                  <Loader2 size={15} className="spin" />
                  Loading your workspace…
                </div>
              )}
              {view === "Overview" && !demo && !workspace.capabilities.ai && (
                <div className="ai-setup-note">
                  <Sparkles size={19}/>
                  <div><strong>Your AI, built into FiveGen.</strong><p>Generate complete products, images, and videos with FiveGen credits. No API keys needed.</p></div>
                  <button className="text-link" onClick={()=>navigate("AI & credits")}>View AI & credits <ArrowRight size={15}/></button>
                </div>
              )}
              {view === "Overview" && (
                <section className="creation-deck" aria-label="Create a digital product">
                  <div className="creation-stage">
                    <div className="stage-shade" />
                    <div className="stage-content">
                      <span className="stage-label"><Sparkles size={14} /> THE CREATION STUDIO</span>
                      <h2>One idea.<br /><span>Endless possibilities.</span></h2>
                      <p>Your expertise, transformed into something worth owning.</p>
                      <form className="idea-composer" onSubmit={(event) => {
                        event.preventDefault();
                        startCreate({ ...templates[0], title: "", audience: "", description: quickIdea.trim(), format: quickFormat });
                        setStep(1);
                      }}>
                        <label className="sr-only" htmlFor="quick-idea">Describe the product you want to create</label>
                        <textarea id="quick-idea" value={quickIdea} onChange={(event) => setQuickIdea(event.target.value)} maxLength={12000} placeholder="Describe your next digital product…" rows={2} />
                        <div className="composer-bottom">
                          <Select value={quickFormat} onValueChange={(value) => setQuickFormat(value as Brief["format"])}>
                            <SelectTrigger className="composer-format" aria-label="Product format"><SelectValue /></SelectTrigger>
                            <SelectContent>{formats.map((format) => <SelectItem key={format} value={format}>{format}</SelectItem>)}</SelectContent>
                          </Select>
                          <button type="submit" className="button primary"><Sparkles size={16} /> Create product <ArrowUpRight size={16} /></button>
                        </div>
                      </form>
                      <div className="stage-footnote"><span>YOUR IDEA</span><span>PRODUCT</span><span>CAMPAIGN</span><span>STOREFRONT</span></div>
                    </div>
                    <span className="stage-art-label">FIVEGEN ORIGINAL / 001</span>
                  </div>
                  <div className="creation-shortcuts">
                    <button className="shortcut-card shortcut-blue" onClick={() => startCreate({ ...templates[5] })}>
                      <span className="shortcut-art" aria-hidden="true" />
                      <span className="shortcut-top"><BookOpen size={18} /><span>01 / KNOWLEDGE</span></span>
                      <span className="shortcut-bottom"><span><strong>Guides & ebooks</strong><small>Package your expertise</small></span><span className="shortcut-arrow"><ArrowUpRight size={19} /></span></span>
                    </button>
                    <button className="shortcut-card shortcut-chrome" onClick={() => startCreate({ ...templates[0] })}>
                      <span className="shortcut-art" aria-hidden="true" />
                      <span className="shortcut-top"><Layers3 size={18} /><span>02 / SYSTEMS</span></span>
                      <span className="shortcut-bottom"><span><strong>Templates & toolkits</strong><small>Create a better starting point</small></span><span className="shortcut-arrow"><ArrowUpRight size={19} /></span></span>
                    </button>
                  </div>
                </section>
              )}
              {["Overview", "Analytics"].includes(view) && (
                <>
                  <section className="stats-grid">
                    {[
                      {
                        title: "Total revenue",
                        value: money(revenue),
                        icon: CreditCard,
                        note: demo ? "+18.6%" : "Gross sales",
                        line: [8, 10, 9, 15, 13, 20, 18, 23, 22, 30],
                      },
                      {
                        title: "Products sold",
                        value: sales.toLocaleString(),
                        icon: ShoppingBag,
                        note: demo ? "+12.4%" : "Paid orders",
                        line: [8, 14, 10, 16, 14, 15, 20, 16, 27, 28],
                      },
                      {
                        title: "Storefront views",
                        value: visits.toLocaleString(),
                        icon: MousePointer2,
                        note: demo ? "+24.8%" : "Total page views",
                        line: [8, 12, 10, 17, 13, 21, 19, 25, 22, 32],
                      },
                      {
                        title: "Conversion rate",
                        value: `${visits ? ((sales / visits) * 100).toFixed(2) : "0.00"}%`,
                        icon: TrendingUp,
                        note: demo ? "+0.8%" : "Sales / page views",
                        line: [10, 10, 16, 14, 20, 17, 23, 23, 27, 29],
                      },
                    ].map((s) => (
                      <article className="stat-card" key={s.title}>
                        <div className="stat-label">
                          {s.title}
                          <s.icon size={17} />
                        </div>
                        <div className="stat-main">
                          <strong>{s.value}</strong>
                          <svg
                            className="sparkline"
                            viewBox="0 0 100 40"
                            aria-hidden="true"
                          >
                            <polyline
                              points={(demo ? s.line : s.line.map(() => 8))
                                .map((p, i) => `${i * 11},${40 - p}`)
                                .join(" ")}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </div>
                        <div className="stat-note">
                          <span className={demo ? "positive" : ""}>
                            {demo && <ArrowUpRight size={13} />} {s.note}
                          </span>
                          {demo && <small>vs. previous period</small>}
                        </div>
                      </article>
                    ))}
                  </section>
                  <div className="dashboard-columns">
                    <section className="panel revenue-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Revenue overview</h2>
                          <p>Sales performance over time</p>
                        </div>
                        <span className="chart-key">
                          <i />
                          Revenue
                        </span>
                      </div>
                      <div className="chart-total">
                        {money(revenue)}
                        <span>in the last {period} days</span>
                      </div>
                      <div className="revenue-chart">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart
                            data={chartData}
                            margin={{
                              top: 12,
                              left: -16,
                              right: 12,
                              bottom: 0,
                            }}
                          >
                            <defs>
                              <linearGradient
                                id="revenueGradient"
                                x1="0"
                                y1="0"
                                x2="0"
                                y2="1"
                              >
                                <stop
                                  offset="0%"
                                  stopColor="#dbff73"
                                  stopOpacity={0.2}
                                />
                                <stop
                                  offset="95%"
                                  stopColor="#dbff73"
                                  stopOpacity={0.005}
                                />
                              </linearGradient>
                            </defs>
                            <CartesianGrid
                              vertical={false}
                              stroke="#2b2b30"
                              strokeDasharray="4 5"
                            />
                            <XAxis
                              dataKey="label"
                              axisLine={false}
                              tickLine={false}
                              minTickGap={44}
                              tick={{ fill: "#9595a1", fontSize: 12 }}
                              dy={10}
                            />
                            <YAxis
                              axisLine={false}
                              tickLine={false}
                              tick={{ fill: "#9595a1", fontSize: 12 }}
                              tickFormatter={(v) =>
                                v >= 1000 ? `$${v / 1000}k` : `$${v}`
                              }
                              domain={[0, "auto"]}
                            />
                            <Tooltip
                              contentStyle={{
                                border: "1px solid #3a3a40",
                                background: "#202024",
                                color: "#f3f3f5",
                                borderRadius: 12,
                                fontSize: 13,
                              }}
                              formatter={(v) => [
                                money(Number(v) * 100),
                                "Revenue",
                              ]}
                            />
                            <Area
                              type="monotone"
                              dataKey="revenue"
                              stroke="#dbff73"
                              fill="url(#revenueGradient)"
                              strokeWidth={2.5}
                              animationDuration={900}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      {!demo && orders.length === 0 && (
                        <p className="chart-empty-caption">
                          Your first sale starts the story. Publish a product to
                          begin.
                        </p>
                      )}
                    </section>
                    <section className="panel activity-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>Recent sales</h2>
                          <p>Your latest transactions</p>
                        </div>
                        <button
                          className="icon-button"
                          aria-label="View all sales"
                          onClick={() => navigate("Customers")}
                        >
                          <ArrowUpRight size={18} />
                        </button>
                      </div>
                      {orders.length ? (
                        orders.slice(0, 4).map((o, i) => (
                          <div className="sale-row" key={o.id}>
                            <span className={`customer-avatar avatar-${i % 3}`}>
                              {o.email.slice(0, 2).toUpperCase()}
                            </span>
                            <div>
                              <strong>{o.email.split("@")[0]}</strong>
                              <p>
                                {o.title ||
                                  workspace.products.find(
                                    (p) => p.id === o.productId,
                                  )?.title ||
                                  "Digital product"}
                              </p>
                              <small>
                                {o.provider === "whop" ? "Whop" : "Stripe"} ·{" "}
                                {new Date(o.createdAt).toLocaleTimeString(
                                  "en-US",
                                  {
                                    hour: "numeric",
                                    minute: "2-digit",
                                    timeZone: "UTC",
                                  },
                                )}
                              </small>
                            </div>
                            <b>+{money(o.amount)}</b>
                          </div>
                        ))
                      ) : (
                        <div className="empty-sales">
                          <ShoppingBag size={29} />
                          <h3>Your first sale is ahead.</h3>
                          <p>
                            Once someone buys your product, you’ll see it here.
                          </p>
                          <button
                            className="text-link"
                            onClick={() => startCreate()}
                          >
                            Create a product <ArrowRight size={14} />
                          </button>
                        </div>
                      )}
                      <button
                        className="activity-footer"
                        onClick={() => navigate("Customers")}
                      >
                        View all transactions
                        <ArrowRight size={15} />
                      </button>
                    </section>
                  </div>
                </>
              )}
              {(view === "Overview" || view === "My products") && (
                <section className="products-section">
                  <div className="section-heading">
                    <div>
                      <h2>
                        {view === "Overview" ? "Your products" : "Made by you"}
                      </h2>
                      <p>
                        {displayProducts.length
                          ? "From your mind to the world."
                          : "Your next great idea belongs here."}
                      </p>
                    </div>
                    {view === "Overview" ? (
                      <button
                        className="text-link"
                        onClick={() => navigate("My products")}
                      >
                        View all products
                        <ArrowRight size={15} />
                      </button>
                    ) : (
                      <div className="list-tools">
                        <div className="search-box">
                          <Search size={16} />
                          <input
                            aria-label="Search products"
                            placeholder="Search products…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                          />
                        </div>
                        <Select value={filter} onValueChange={setFilter}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All products</SelectItem>
                            <SelectItem value="published">Published</SelectItem>
                            <SelectItem value="draft">Drafts</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  {filtered.length ? (
                    productCards(
                      view === "Overview" ? filtered.slice(0, 3) : filtered,
                    )
                  ) : (
                    <div className="empty-products">
                      <span className="empty-icon">
                        <Package size={27} />
                      </span>
                      <h3>
                        {search
                          ? "No matching products"
                          : "Your first product starts with an idea."}
                      </h3>
                      <p>
                        {search
                          ? "Try a different search."
                          : "Bring your knowledge. We’ll help you put it together."}
                      </p>
                      <button
                        className="button primary"
                        onClick={() => startCreate()}
                      >
                        <Plus size={16} />
                        Create a product
                      </button>
                    </div>
                  )}
                </section>
              )}
              {view === "Templates" && (
                <>
                  <div className="template-toolbar">
                    <Tabs value={filter} onValueChange={setFilter}>
                      <TabsList>
                        <TabsTrigger value="all">All templates</TabsTrigger>
                        {formats.map((f) => (
                          <TabsTrigger key={f} value={f}>
                            {f}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                    <span>{selectedTemplates.length} starting points</span>
                  </div>
                  <div className="products-grid template-grid">
                    {selectedTemplates.map((t) => (
                      <article className="product-card" key={t.title}>
                        <button
                          className="cover-button"
                          onClick={() => startCreate(t)}
                        >
                          <Cover product={t} />
                        </button>
                        <div className="product-card-body">
                          <span className="template-format">{t.format}</span>
                          <h3>{t.title}</h3>
                          <p className="template-description">
                            {t.description}
                          </p>
                          <button
                            className="button secondary full"
                            onClick={() => startCreate(t)}
                          >
                            Use this template
                            <ArrowRight size={15} />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              )}
              {view === "Customers" && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>{demo ? "Example customers" : "Your customers"}</h2>
                      <p>{orders.length} transactions in the selected period</p>
                    </div>
                    <button className="button secondary" onClick={exportSales}>
                      <ArrowDownToLine size={15} />
                      Download CSV
                    </button>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Customer</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Payment method</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders.map((o) => (
                        <TableRow key={o.id}>
                          <TableCell>{o.email}</TableCell>
                          <TableCell>
                            {o.title ||
                              workspace.products.find(
                                (p) => p.id === o.productId,
                              )?.title}
                          </TableCell>
                          <TableCell>
                            <span className="provider-label">{o.provider}</span>
                          </TableCell>
                          <TableCell>
                            {new Date(o.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {money(o.amount)}
                            <small className="order-fee">FiveGen fee {money(o.platformFee||0)} · {money(o.amount-(o.platformFee||0))} before processing</small>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {!orders.length && (
                    <div className="empty-products">
                      <Users size={30} />
                      <h3>A community starts with one customer.</h3>
                      <p>Share your published product to welcome your first.</p>
                    </div>
                  )}
                </section>
              )}
              {view === "Payments" && (
                <>
                  <div className="payment-summary panel">
                    <span className="type-icon peach">
                      <CreditCard size={26} />
                    </span>
                    <div>
                      <span>
                        Tracked revenue · last {period} days
                        {demo ? " · sample" : ""}
                      </span>
                      <h2>{money(revenue)}</h2>
                    </div>
                    <p>
                      Payments go to your connected account.
                      <br />
                      Manage payouts and refunds with your payment provider.
                    </p>
                  </div>
                  <div className="integration-grid">
                    <section className="panel integration-card">
                      <span className="stripe-word">stripe</span>
                      <span
                        className={`integration-status ${workspace.stripeReady ? "ready" : ""}`}
                      >
                        {workspace.stripeReady
                          ? "Connected"
                          : workspace.settings.stripeAccount
                            ? "Finish setup"
                            : "Not connected"}
                      </span>
                      <h2>Sell with Stripe</h2>
                      <p>
                        Accept cards and supported local payment methods.
                        Verified purchases unlock your product automatically.
                      </p>
                      <ul>
                        <li>
                          <Check size={15} />
                          Secure hosted checkout
                        </li>
                        <li>
                          <Check size={15} />
                          Automatic product delivery
                        </li>
                        <li>
                          <Check size={15} />
                          Sales tracked in your dashboard
                        </li>
                      </ul>
                      <button
                        className="button dark full"
                        disabled={busy}
                        onClick={async () => {
                          if (!requireUser()) return;
                          setBusy(true);
                          try {
                            const d = await api<{ url: string }>(
                              "/api/connect/stripe",
                              "POST",
                              {},
                            );
                            location.href = d.url;
                          } catch (e) {
                            toast.error((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {busy ? (
                          <Loader2 size={16} className="spin" />
                        ) : (
                          <Link2 size={16} />
                        )}{" "}
                        {workspace.settings.stripeAccount
                          ? "Continue Stripe setup"
                          : "Connect Stripe"}
                        <ArrowUpRight size={16} />
                      </button>
                      {!workspace.capabilities.stripe && (
                        <small>
                          Platform Stripe configuration is required before
                          connecting a seller.
                        </small>
                      )}
                    </section>
                    <section className="panel integration-card"><span className="whop-word">◢ whop</span><span className="integration-status">Integration pending</span><h2>Commission-aware checkout</h2><p>Direct Whop links are paused while we add tracked payments and platform commissions. Use Stripe to sell and automatically apply your plan’s fee.</p><div className="sales-note">Your plan: {workspace.plan.tier==="pro"?"3%":"10%"} FiveGen commission, plus Stripe processing fees.</div></section>
                  </div>
                  <div className="info-note">
                    <CircleHelp size={19} />
                    <p>
                      FiveGen only counts verified Stripe payments in live
                      revenue. Your FiveGen commission is deducted automatically. Example
                      sales are visible only when sample data is enabled.
                    </p>
                  </div>
                </>
              )}
              {view === "AI & credits" && (
                <AIProviders signedIn={!!user} onUpdate={() => void reload()} />
              )}
              {view === "Plan & billing" && <BillingPage plan={workspace.plan} onRefresh={() => void reload()} signedIn={!!user}/>}
              {view === "Settings" && (
                <div className="settings-layout">
                  <section className="panel settings-card">
                    <h2>Workspace details</h2>
                    <p>A home for the things you create.</p>
                    <label>
                      Workspace name
                      <input
                        value={settingsName}
                        onChange={(e) => setSettingsName(e.target.value)}
                        maxLength={60}
                      />
                    </label>
                    <label>
                      Account email
                      <input
                        value={
                          user?.email || "Sign in to manage your workspace"
                        }
                        disabled
                      />
                    </label>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={async () => {
                        if (!requireUser()) return;
                        setBusy(true);
                        try {
                          await api("/api/workspace", "PATCH", {
                            name: settingsName,
                          });
                          await reload();
                          toast.success("Workspace updated");
                        } catch (e) {
                          toast.error((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Save changes
                    </button>
                  </section>
                  <section className="panel settings-card">
                    <h2>Generation</h2>
                    <div className="setting-status">
                      <Sparkles size={19} />
                      <div>
                        <strong>
                          {workspace.capabilities.ai
                            ? "AI generation available"
                            : "Structured starter mode"}
                        </strong>
                        <p>
                          {workspace.capabilities.ai
                            ? "Products are generated from your brief."
                            : "Create editable outlines and worksheets now. FiveGen AI will be available when the administrator completes setup."}
                        </p>
                      </div>
                    </div>
                    <h2>Product links</h2>
                    <div className="setting-status">
                      <Globe size={19} />
                      <div>
                        <strong>Your own shareable storefront</strong>
                        <p>
                          Every published product gets a unique /p/product-name
                          link. Product subdomains require a domain you own and
                          wildcard DNS configured by your hosting provider.
                        </p>
                      </div>
                    </div>
                    <a
                      href={
                        user
                          ? "/signout-with-chatgpt?return_to=/"
                          : "/signin-with-chatgpt?return_to=/"
                      }
                      className="text-link"
                    >
                      {user ? "Sign out" : "Sign in"}
                      <ArrowRight size={14} />
                    </a>
                  </section>
                </div>
              )}
            </>
          )}
          <footer className="workspace-footer">
            <span>
              <span className="footer-logo">✳</span> A little idea can go a long
              way.
            </span>
            <span>Made for makers. Built with FiveGen.</span>
          </footer>
        </main>
      </SidebarInset>
      <CreateProductFlow textCost={workspace.textCost||10} open={create} onOpenChange={setCreate} brief={brief} onBriefChange={setBrief} step={step} onStepChange={setStep} busy={busy} aiReady={workspace.capabilities.ai} signedIn={!!user} error={creationError} onCreate={() => void generate()} onConnectAI={() => { if (!user) { sessionStorage.setItem("folio-unsaved-brief", JSON.stringify(brief)); sessionStorage.setItem("fivegen-brief-destination", "AI & credits"); } setCreate(false); setResumeBrief(true); commitNavigation("AI & credits"); }} />
      {editor && <>
        <ProductPreview product={editor} open={preview} onOpenChange={setPreview} />
        <PublishReview product={editor} open={publishReview} onOpenChange={setPublishReview} busy={busy} paymentsReady={!!workspace.stripeReady} onPayments={() => { setEditTab("storefront"); setPublishReview(false); }} onPublish={() => void publishProduct(editor)} />
      </>}
      <AlertDialog open={!!pendingAction} onOpenChange={(open) => !open && !busy && setPendingAction(null)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Save your changes?</AlertDialogTitle><AlertDialogDescription>Your latest edits haven’t been saved yet.</AlertDialogDescription></AlertDialogHeader><div className="unsaved-actions"><button className="button secondary" disabled={busy} onClick={() => setPendingAction(null)}>Keep editing</button><button className="button secondary" disabled={busy} onClick={() => { const action = pendingAction; if(editorBaseline) setEditor(JSON.parse(editorBaseline)); setPendingAction(null); action?.(); }}>Discard edits</button><button className="button primary" disabled={busy} onClick={async () => { if(editor && await save(editor)) { const action = pendingAction; setPendingAction(null); action?.(); } }}>{busy ? "Saving…" : "Save & continue"}</button></div></AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!publish} onOpenChange={() => setPublish(null)}>
        <DialogContent className="publish-dialog">
          <DialogHeader>
            <span className="success-symbol">
              <Check size={30} />
            </span>
            <DialogTitle>Your product has its own home.</DialogTitle>
            <DialogDescription>
              Your product page is published. Access follows your site’s sharing settings.
            </DialogDescription>
          </DialogHeader>
          {publish && (
            <>
              <Cover product={publish} />
              <div className="share-link">
                <Link2 size={17} />
                <span>
                  {typeof location !== "undefined" ? location.host : ""}/p/
                  {publish.slug}
                </span>
                <button
                  className="icon-button"
                  onClick={() => void copyLink(publish)}
                  aria-label="Copy product link"
                >
                  <Layers3 size={17} />
                </button>
              </div>
              <a
                className="button primary full"
                href={`/p/${publish.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                View your product
                <ArrowUpRight size={17} />
              </a>
              {publish.price > 0 &&
                !workspace.stripeReady &&
                !publish.whopUrl && (
                  <p className="generation-note">
                    Your page is live. Connect Stripe to accept payments.
                  </p>
                )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>A little idea. A real product.</DialogTitle>
            <DialogDescription>
              Here’s how to take it from your head to someone’s hands.
            </DialogDescription>
          </DialogHeader>
          <div className="help-steps">
            {[
              [
                "Create",
                "Choose a format and describe who your product helps.",
              ],
              [
                "Make it yours",
                "Edit the content, add your examples, and set your price.",
              ],
              [
                "Connect",
                "Connect Stripe for payments, commission collection, and automatic delivery.",
              ],
              [
                "Publish",
                "Publish your storefront, copy the link, and share it anywhere.",
              ],
            ].map(([t, d], i) => (
              <div key={t}>
                <span>{i + 1}</span>
                <div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </div>
              </div>
            ))}
          </div>
          <button
            className="button primary full"
            onClick={() => {
              setHelp(false);
              startCreate();
            }}
          >
            Create my first product
            <ArrowRight size={16} />
          </button>
        </DialogContent>
      </Dialog>
      <Toaster theme="dark" position="bottom-right" richColors closeButton />
    </SidebarProvider>
  );
}
