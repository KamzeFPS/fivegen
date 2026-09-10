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
  ExternalLink,
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
  | "AI providers";
type Workspace = {
  products: Product[];
  orders: Order[];
  visits: { createdAt: number }[];
  settings: { name: string; stripeAccount: string | null };
  capabilities: { ai: boolean; stripe: boolean; domain: string | null };
  stripeReady?: boolean;
};
const empty: Workspace = {
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
          setStep(1);
          setCreate(true);
        } catch {}
        sessionStorage.removeItem("folio-unsaved-brief");
      }
    }
    if (new URLSearchParams(location.search).has("stripe")) setView("Payments");
  }, [user]);
  const navigate = (v: View) => {
    setView(v);
    setSearch("");
    setFilter("all");
    setEditor(null);
  };
  const requireUser = () => {
    if (user) return true;
    window.location.href = "/signin-with-chatgpt?return_to=/";
    return false;
  };
  function startCreate(t?: Brief) {
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
  }
  async function generate() {
    if (!user)
      sessionStorage.setItem("folio-unsaved-brief", JSON.stringify(brief));
    if (!requireUser()) return;
    setBusy(true);
    try {
      const p = await api<{ product: Product; mode: string }>(
        "/api/products",
        "POST",
        brief,
      );
      setCreate(false);
      setEditor(p.product);
      setSection(0);
      setEditTab("content");
      setView("My products");
      setDemo(false);
      await reload();
      toast.success(
        p.mode === "ai"
          ? "Your AI production workflow is starting."
          : "Your editable starter is ready. Connect an AI provider for complete generation.",
      );
    } catch (e) {
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
      setEditor(r.product);
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
      setEditor(r.product);
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
        ["Date", "Product", "Customer", "Amount (USD)", "Provider"],
        ...orders.map((o) => [
          new Date(o.createdAt).toISOString(),
          o.title || "",
          o.email,
          (o.amount / 100).toFixed(2),
          o.provider,
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
                : (setEditor(p), setSection(0), setEditTab("content"))
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
                        : (setEditor(p), setSection(0))
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
      <Sidebar className="folio-sidebar">
        <SidebarHeader className="sidebar-head">
          <Brand />
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
                { name: "AI providers", icon: Sparkles },
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
          <div className="sidebar-note">
            <span className="note-icon">
              <Sparkles size={19} />
            </span>
            <strong>Your creative engine</strong>
            <p>Connect your models. Bring your ideas to life.</p>
            <button onClick={() => navigate("AI providers")}>
              Manage AI providers <ArrowUpRight size={15} />
            </button>
          </div>
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
      </Sidebar>
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
          {error && (
            <div role="alert" className="error-banner">
              {error}
              <button onClick={() => void reload()}>Try again</button>
            </div>
          )}
          {editor ? (
            <>
              <div className="page-heading">
                <div>
                  <button className="back-link" onClick={() => setEditor(null)}>
                    <ArrowLeft size={15} />
                    All products
                  </button>
                  <h1>{editor.title}</h1>
                  <p>Make it yours. Then make it available to the world.</p>
                </div>
                <div className="heading-actions">
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void save(editor)}
                  >
                    Save changes
                  </button>
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => void publishProduct(editor)}
                  >
                    {busy ? (
                      <Loader2 className="spin" size={16} />
                    ) : (
                      <Globe size={16} />
                    )}
                    Publish product
                  </button>
                </div>
              </div>
              <GenerationProgress
                key={editor.id}
                product={editor}
                onProduct={setEditor}
                onComplete={() => void reload()}
              />
              <Tabs value={editTab} onValueChange={setEditTab}>
                <TabsList className="editor-tabs">
                  <TabsTrigger value="content">Product content</TabsTrigger>
                  <TabsTrigger value="storefront">
                    Storefront & pricing
                  </TabsTrigger>
                  <TabsTrigger value="launch">Launch kit</TabsTrigger>
                  <TabsTrigger value="files">Product files</TabsTrigger>
                  <TabsTrigger value="media">Marketing studio</TabsTrigger>
                </TabsList>
              </Tabs>
              {editTab === "media" ? (
                <MediaStudio product={editor} />
              ) : editTab === "files" ? (
                <ProductFiles product={editor} />
              ) : (
                <div className="editor-layout">
                  {" "}
                  <div className="panel editor-panel">
                    {editTab === "content" ? (
                      <>
                        <div className="section-picker">
                          {editor.content.sections.map((s, i) => (
                            <button
                              key={i}
                              className={section === i ? "selected" : ""}
                              onClick={() => setSection(i)}
                            >
                              <span>{String(i + 1).padStart(2, "0")}</span>
                              {s.title}
                            </button>
                          ))}
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
                            <textarea
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
                            <button
                              className="button secondary"
                              disabled={busy || revision.length < 8}
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  if (!(await save(editor))) return;
                                  const d = await api<{ product: Product }>(
                                    `/api/products/${editor.id}/revise`,
                                    "POST",
                                    { index: section, instructions: revision },
                                  );
                                  setEditor(d.product);
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
                              Refine section
                            </button>
                          </div>
                          <button
                            className="button secondary"
                            onClick={() => {
                              setEditor({
                                ...editor,
                                content: {
                                  ...editor.content,
                                  sections: [
                                    ...editor.content.sections,
                                    {
                                      title: "New section",
                                      body: "Add your knowledge here.",
                                    },
                                  ],
                                },
                              });
                              setSection(editor.content.sections.length);
                            }}
                            disabled={editor.content.sections.length >= 30}
                          >
                            <Plus size={16} />
                            Add section
                          </button>
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
                        <label>
                          Whop checkout link (optional)
                          <input
                            type="url"
                            placeholder="https://whop.com/checkout/…"
                            value={editor.whopUrl || ""}
                            onChange={(e) =>
                              setEditor({ ...editor, whopUrl: e.target.value })
                            }
                          />
                          <small>
                            Use your own Whop checkout. Set up product delivery
                            in Whop. Whop sales are managed in your Whop
                            dashboard.
                          </small>
                        </label>
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
                          <textarea
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
                  </div>
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
                        onClick={async () => {
                          if (await save(editor))
                            window.open(
                              `/api/products/${editor.id}/export`,
                              "_blank",
                            );
                        }}
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
                        Settings: "Make this space feel like yours.",
                        "AI providers":
                          "A complete creative team, powered by your favorite models.",
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
                  <div><strong>Connect your creative team.</strong><p>Add your AI providers to generate complete products, marketing images, and videos.</p></div>
                  <button className="text-link" onClick={()=>navigate("AI providers")}>Set up AI <ArrowRight size={15}/></button>
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
                    <section className="panel integration-card">
                      <span className="whop-word">◢ whop</span>
                      <span className="integration-status">
                        Hosted checkout
                      </span>
                      <h2>Sell with Whop</h2>
                      <p>
                        Bring your Whop checkout link to any product. Customers
                        complete their purchase and receive access through Whop.
                      </p>
                      <ul>
                        <li>
                          <Check size={15} />
                          Your existing Whop checkout
                        </li>
                        <li>
                          <Check size={15} />
                          Payments handled by Whop
                        </li>
                        <li>
                          <Check size={15} />
                          Delivery and analytics in Whop
                        </li>
                      </ul>
                      <button
                        className="button secondary full"
                        onClick={() => navigate("My products")}
                      >
                        <Link2 size={16} />
                        Add a link to a product
                        <ArrowRight size={16} />
                      </button>
                      <a
                        className="text-link"
                        href="https://whop.com/dashboard/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open Whop dashboard
                        <ExternalLink size={14} />
                      </a>
                    </section>
                  </div>
                  <div className="info-note">
                    <CircleHelp size={19} />
                    <p>
                      FiveGen only counts verified Stripe payments in live
                      revenue. Whop purchases are reported in Whop. Example
                      sales are visible only when sample data is enabled.
                    </p>
                  </div>
                </>
              )}
              {view === "AI providers" && (
                <AIProviders signedIn={!!user} onUpdate={() => void reload()} />
              )}
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
                            : "Create editable outlines and worksheets now. Add an AI provider key on the server to generate subject-specific content."}
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
      <Dialog open={create} onOpenChange={(v) => !busy && setCreate(v)}>
        <DialogContent className="create-dialog">
          <DialogHeader>
            <span className="dialog-symbol">
              <Sparkles size={24} />
            </span>
            <div className="eyebrow">LET’S MAKE SOMETHING WORTH SHARING</div>
            <DialogTitle>
              {step === 0
                ? "What are you creating?"
                : busy
                  ? "Bringing your idea to life…"
                  : "Give your idea a little detail."}
            </DialogTitle>
            <DialogDescription>
              {step === 0
                ? "Start with a format. You can make it entirely your own."
                : "Tell us what you know and who you want to help."}
            </DialogDescription>
          </DialogHeader>
          <div className="step-indicator">
            <span className="active" />
            <span className={step === 1 ? "active" : ""} />
          </div>
          {step === 0 ? (
            <>
              <div className="format-options">
                {formats.map((f, i) => {
                  const Icon = [
                    BookOpen,
                    Zap,
                    Layers3,
                    TrendingUp,
                    FileText,
                    Package,
                  ][i];
                  return (
                    <button
                      className={brief.format === f ? "chosen" : ""}
                      key={f}
                      onClick={() => setBrief({ ...brief, format: f })}
                    >
                      <Icon size={22} />
                      <span>
                        <strong>{f}</strong>
                        <small>
                          {
                            [
                              "Share your knowledge, one page at a time.",
                              "Teach a skill in focused, practical lessons.",
                              "Give your audience a useful head start.",
                              "Help someone build a habit that sticks.",
                              "Turn your process into a repeatable system.",
                              "A calculator, workbook, code kit, or something entirely new.",
                            ][i]
                          }
                        </small>
                      </span>
                      <span className="radio-dot">
                        {brief.format === f && <span />}
                      </span>
                    </button>
                  );
                })}
              </div>
              <button
                className="button primary full"
                onClick={() => setStep(1)}
              >
                Continue
                <ArrowRight size={17} />
              </button>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void generate();
              }}
              className="form-stack"
            >
              <label>
                Product name
                <input
                  autoFocus
                  required
                  minLength={3}
                  maxLength={100}
                  placeholder="e.g. The Freelancer’s First Client Playbook"
                  value={brief.title}
                  onChange={(e) =>
                    setBrief({ ...brief, title: e.target.value })
                  }
                />
              </label>
              <label>
                What will your product help people do?
                <textarea
                  required
                  minLength={12}
                  maxLength={12000}
                  placeholder="Share the problem you solve, your approach, and what people will walk away with…"
                  value={brief.description}
                  onChange={(e) =>
                    setBrief({ ...brief, description: e.target.value })
                  }
                />
              </label>
              <div className="form-two">
                <label>
                  Who is it for?
                  <input
                    required
                    minLength={3}
                    maxLength={300}
                    placeholder="e.g. First-time freelancers"
                    value={brief.audience}
                    onChange={(e) =>
                      setBrief({ ...brief, audience: e.target.value })
                    }
                  />
                </label>
                <label>
                  Price · USD
                  <input
                    required
                    type="number"
                    min="0"
                    max="9999"
                    step="0.01"
                    value={brief.price}
                    onChange={(e) =>
                      setBrief({ ...brief, price: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
              <label>
                Creative direction & requirements
                <textarea
                  maxLength={12000}
                  placeholder="Describe the deliverables, examples to include, depth, visual style, and what would make this exceptional…"
                  value={brief.instructions || ""}
                  onChange={(e) =>
                    setBrief({ ...brief, instructions: e.target.value })
                  }
                />
              </label>
              <div className="form-two">
                <label>
                  Language
                  <input
                    placeholder="English, Mongolian…"
                    value={brief.language || "English"}
                    onChange={(e) =>
                      setBrief({ ...brief, language: e.target.value })
                    }
                  />
                </label>
                <label>
                  Depth
                  <Select
                    value={brief.quality || "premium"}
                    onValueChange={(v) =>
                      setBrief({
                        ...brief,
                        quality: v as "premium" | "balanced",
                      })
                    }
                  >
                    <SelectTrigger className="provider-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="premium">
                        Premium · in depth
                      </SelectItem>
                      <SelectItem value="balanced">
                        Balanced · focused
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>
              <div className="generation-note">
                <Sparkles size={16} />
                {workspace.capabilities.ai
                  ? "AI will create your full product, supporting files, sales copy, and launch campaign. Create images and videos in the Marketing studio."
                  : "Starter mode: an editable structure, worksheets, and launch kit. Add your expertise before selling."}
              </div>
              <div className="dialog-actions">
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setStep(0)}
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
                <button
                  className="button primary"
                  disabled={busy}
                  type="submit"
                >
                  {busy ? (
                    <Loader2 className="spin" size={17} />
                  ) : (
                    <Sparkles size={17} />
                  )}{" "}
                  {busy
                    ? "Creating your product…"
                    : user
                      ? workspace.capabilities.ai
                        ? "Generate complete product"
                        : "Create editable starter"
                      : "Sign in & create"}
                </button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
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
                    Your page is live. Connect Stripe or add a Whop checkout
                    link to accept payments.
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
                "Connect Stripe for automatic delivery, or add your Whop checkout link.",
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
