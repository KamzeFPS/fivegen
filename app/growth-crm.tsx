"use client";
import { useEffect, useState } from "react";
import { Check, Copy, Download, Loader2, RefreshCw, Search, Users, X } from "lucide-react";
import { leadsCsv, leadStatuses, type GrowthLead, type LeadStatus } from "@/lib/growth-funnel";

type LeadPage = { leads: GrowthLead[]; total: number; nextOffset: number | null };
async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(data.error || "Please try again."); return data;
}
export function GrowthCRM({ onDirtyChange, onBusyChange }: { onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void } = {}) {
  const [page, setPage] = useState<LeadPage>({ leads: [], total: 0, nextOffset: null }), [query, setQuery] = useState(""), [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<GrowthLead | null>(null), [notes, setNotes] = useState(""), [leadStatus, setLeadStatus] = useState<LeadStatus>("new"), [followUp, setFollowUp] = useState("");
  const [revision, setRevision] = useState(0);
  const dirty = !!selected && (notes !== selected.notes || leadStatus !== selected.status);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  const filter = new URLSearchParams({ q: query, status }).toString();
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => { setLoading(true); setError(""); void api<LeadPage>(`/api/growth/crm?${filter}`).then(data => { if (active) setPage(data); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [filter, revision]);
  async function selectLead(lead: GrowthLead) {
    if (busy) return;
    if (selected && (notes !== selected.notes || leadStatus !== selected.status) && !window.confirm("Discard the unsaved changes to this lead?")) return;
    setSelected(lead); setNotes(lead.notes); setLeadStatus(lead.status); setFollowUp(""); setError(""); setNotice("");
  }
  async function saveLead() {
    if (!selected) return; setBusy(true); setError("");
    try { const data = await api<{ lead: GrowthLead }>("/api/growth/crm", "PATCH", { id: selected.id, status: leadStatus, notes, expectedUpdatedAt: selected.updatedAt }); setSelected(data.lead); setPage(current => ({ ...current, leads: current.leads.map(lead => lead.id === data.lead.id ? data.lead : lead) })); setRevision(value => value + 1); setNotice("Lead updated."); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function exportLeads() {
    setBusy(true); setError("");
    try {
      const all: GrowthLead[] = []; let offset: number | null = 0;
      while (offset !== null) { const data: LeadPage = await api(`/api/growth/crm?${filter}&offset=${offset}`); all.push(...data.leads); offset = data.nextOffset; }
      const url = URL.createObjectURL(new Blob([leadsCsv(all)], { type: "text/csv;charset=utf-8" })), anchor = document.createElement("a"); anchor.href = url; anchor.download = `fivegen-leads-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice(`Exported ${all.length} matching leads.`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function draftFollowUp() {
    if (!selected) return; setBusy(true); setError("");
    try { const data = await api<{ growth: { assets: { followUp: string } | null } }>(`/api/products/${selected.productId}/growth`); setFollowUp(data.growth.assets?.followUp || "No follow-up draft yet. Write one in this product’s VSL workspace."); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <section className="growth-workspace growth-crm">
    <div className="growth-heading"><div><span className="eyebrow">CRM</span><h1>Turn interest into conversation.</h1><p>Every signup from your landing pages, with context for your next step.</p></div><button className="button secondary" disabled={busy || loading || !page.total} onClick={() => void exportLeads()}><Download size={16}/>Export CSV</button></div>
    <div className="growth-crm-toolbar"><label className="growth-search"><Search size={17}/><input type="search" placeholder="Search name, email or product" aria-label="Search leads" maxLength={150} value={query} disabled={busy} onChange={e => setQuery(e.target.value)}/></label><label>Status<select value={status} disabled={busy} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{leadStatuses.map(value => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}</select></label><button className="button secondary" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={15}/>Refresh</button><span className="growth-lead-count">{loading ? "Loading…" : `${page.total} ${page.total === 1 ? "lead" : "leads"}`}</span></div>
    {error && <p className="error-banner" role="alert">{error}</p>}{notice && <p className="growth-notice" role="status"><Check size={16}/>{notice}</p>}
    <div className={`growth-crm-grid ${selected ? "has-detail" : ""}`}><div>
      {!loading && !page.leads.length ? <div className="growth-empty"><Users size={30}/><h2>{query || status ? "No matching leads" : "Your next conversation starts here."}</h2><p>{query || status ? "Try another search or status." : "Publish a product’s landing page under Funnel, then share its link. Real signups will appear here."}</p></div> : <div className="growth-table-wrap"><table className="growth-lead-table"><thead><tr><th>Name / email</th><th>Product</th><th>Status</th><th>Signed up</th></tr></thead><tbody>{page.leads.map(lead => <tr key={lead.id} className={selected?.id === lead.id ? "is-selected" : ""}><td><button className="growth-lead-name" disabled={busy} onClick={() => void selectLead(lead)}><strong>{lead.name}</strong><span>{lead.email}</span></button></td><td>{lead.productTitle}</td><td><span className={`growth-lead-status status-${lead.status}`}>{lead.status}</span></td><td>{new Date(lead.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
      {loading && <p className="growth-loading" role="status"><Loader2 className="spin" size={16}/>Loading leads…</p>}
      {page.nextOffset !== null && <button className="button secondary" disabled={busy || loading} onClick={async () => { setBusy(true); try { const data: LeadPage = await api(`/api/growth/crm?${filter}&offset=${page.nextOffset}`); setPage(current => ({ ...data, leads: [...current.leads, ...data.leads] })); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>Load more</button>}
    </div>{selected && <aside className="growth-card growth-lead-detail"><div className="growth-card-heading"><div><h2>{selected.name}</h2><p>{selected.email}</p></div><button className="icon-button" disabled={busy} aria-label="Close lead details" onClick={() => { if ((notes !== selected.notes || leadStatus !== selected.status) && !window.confirm("Discard the unsaved changes to this lead?")) return; setSelected(null); }}><X size={18}/></button></div>
      <dl className="growth-lead-facts"><div><dt>Interested in</dt><dd>{selected.productTitle}</dd></div><div><dt>Source</dt><dd>{selected.source}</dd></div><div><dt>First signup</dt><dd>{new Date(selected.createdAt).toLocaleString()}</dd></div><div><dt>Latest signup</dt><dd>{new Date(selected.lastSeenAt).toLocaleString()}</dd></div><div><dt>Marketing consent</dt><dd>{selected.marketing ? `Opted in ${selected.consentAt ? new Date(selected.consentAt).toLocaleString() : ""}` : "Not opted in"}</dd></div></dl>
      <fieldset className="growth-form-stack" disabled={busy}><label>Status<select value={leadStatus} onChange={e => setLeadStatus(e.target.value as LeadStatus)}>{leadStatuses.map(value => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}</select></label><label>Private notes<textarea rows={5} value={notes} maxLength={10000} onChange={e => setNotes(e.target.value)} placeholder="What would help this person next?"/></label><button className="button primary" disabled={notes === selected.notes && leadStatus === selected.status} onClick={() => void saveLead()}>{busy ? "Saving…" : "Save lead"}</button></fieldset>
      <div className="growth-follow-up"><h3>Follow up personally</h3><p>Copy your product’s draft, then adapt it to this person in your email app. Email is sent by you.</p><button className="button secondary" disabled={busy} onClick={() => void draftFollowUp()}>Show product follow-up draft</button>{followUp && <><textarea aria-label="Saved product follow-up draft" rows={9} value={followUp} readOnly/><button className="button secondary" disabled={busy} onClick={() => void navigator.clipboard.writeText(followUp).then(() => setNotice("Draft copied. Review and send it from your email app.")).catch(() => setError("Could not copy. Select and copy the text manually."))}><Copy size={15}/>Copy draft</button></>}</div>
    </aside>}</div>
  </section>;
}
export default GrowthCRM;
