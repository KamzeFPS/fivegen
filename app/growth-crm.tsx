"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Copy, Download, Loader2, Mail, RefreshCw, Search, Users, X } from "lucide-react";
import { leadsCsv, leadStatuses, type GrowthLead, type LeadStatus } from "@/lib/growth-funnel";
import './growth-crm.css';

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
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const dirty = !!selected && (notes !== selected.notes || leadStatus !== selected.status);
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(busy); return () => onBusyChange?.(false); }, [busy, onBusyChange]);
  useEffect(() => {
    if (!selected) return;
    detailHeading.current?.focus({ preventScroll: true });
    if (window.matchMedia('(max-width:1100px)').matches) detailHeading.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
  }, [selected?.id]);
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
  return <section className="growth-workspace growth-crm" aria-busy={loading}>
    <header className="growth-heading"><div><h1>Customers & leads</h1><p>Manage the people who signed up through your product pages.</p></div><button className="button secondary" disabled={busy || loading || !page.total} onClick={() => void exportLeads()}><Download size={16}/>Export CSV</button></header>
    <div className="crm-contact-panel">
      <div className="growth-crm-toolbar">
        <label className="growth-search"><Search size={17}/><input type="search" placeholder="Search name, email, or product" aria-label="Search leads" maxLength={150} value={query} disabled={busy} onChange={e => { setLoading(true); setQuery(e.target.value); }}/></label>
        <label className="crm-status-filter"><span>Status</span><select aria-label="Filter contacts by status" value={status} disabled={busy} onChange={e => { setLoading(true); setStatus(e.target.value); }}><option value="">All statuses</option>{leadStatuses.map(value => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}</select></label>
        <button className="crm-refresh" disabled={busy || loading} aria-label="Refresh contacts" title="Refresh contacts" onClick={() => { setLoading(true); setRevision(value => value + 1); }}><RefreshCw size={17}/></button>
      </div>
      <div className="crm-list-context"><span aria-live="polite">{loading ? "Loading contacts…" : `${page.total.toLocaleString()} ${page.total === 1 ? "contact" : "contacts"}${query || status ? ' matching your filters' : ''}`}</span>{query || status ? <button className="crm-text-button" disabled={busy} onClick={() => { setLoading(true); setQuery(''); setStatus(''); }}>Clear filters<X size={13}/></button> : <span>Select a contact to view details</span>}</div>
      {error && <p className="error-banner" role="alert">{error}</p>}{notice && <p className="growth-notice" role="status"><Check size={16}/>{notice}</p>}
      <div className={`growth-crm-grid ${selected ? "has-detail" : ""}`}><div className="crm-contacts-list">
        {loading ? <div className="crm-loading" role="status"><Loader2 className="spin" size={20}/><p>Loading contacts…</p></div> : !page.leads.length ? <div className="growth-empty"><span className="crm-empty-icon"><Users size={26}/></span><h2>{query || status ? "No matching contacts" : "Your audience will appear here"}</h2><p>{query || status ? "Try another name, email, product, or status." : "Add the optional Funnel plugin to a product, publish a lead capture page, and share it. Real signups appear here automatically."}</p>{query || status ? <button className="button secondary" onClick={() => { setLoading(true); setQuery(''); setStatus(''); }}>Clear filters</button> : <a className="button secondary" href="/?view=library">Open products<ArrowRight size={16}/></a>}</div> : <div className="growth-table-wrap"><table className="growth-lead-table"><caption className="crm-sr-only">Contacts captured through your product pages. Select a name to view and edit the contact.</caption><thead><tr><th scope="col">Contact</th><th scope="col">Product</th><th scope="col">Status</th><th scope="col">Signed up</th></tr></thead><tbody>{page.leads.map(lead => <tr key={lead.id} className={selected?.id === lead.id ? "is-selected" : ""}><td><button className="growth-lead-name" disabled={busy} aria-label={`Open contact ${lead.name}, ${lead.email}`} aria-expanded={selected?.id === lead.id} aria-controls={selected?.id === lead.id ? 'crm-contact-details' : undefined} onClick={() => void selectLead(lead)}><span className="crm-contact-avatar" aria-hidden="true">{(lead.name || lead.email).slice(0,1).toUpperCase()}</span><span className="crm-contact-identity"><strong>{lead.name || lead.email}</strong><span>{lead.email}</span></span></button></td><td className="crm-product-cell">{lead.productTitle}</td><td><span className={`growth-lead-status status-${lead.status}`}>{lead.status.charAt(0).toUpperCase()+lead.status.slice(1)}</span></td><td className="crm-date-cell">{new Date(lead.createdAt).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</td></tr>)}</tbody></table></div>}
        {!loading && page.nextOffset !== null && <div className="crm-pagination"><span>Showing {page.leads.length} of {page.total} contacts</span><button className="button secondary" disabled={busy} onClick={async () => { setBusy(true); try { const data: LeadPage = await api(`/api/growth/crm?${filter}&offset=${page.nextOffset}`); setPage(current => ({ ...data, leads: [...current.leads, ...data.leads] })); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>{busy?<Loader2 size={15} className="spin"/>:null}Load more</button></div>}
      </div>{selected && <aside id="crm-contact-details" aria-labelledby="crm-contact-heading" className="growth-card growth-lead-detail"><div className="growth-card-heading"><div><span className="crm-detail-label">Contact details</span><h2 id="crm-contact-heading" ref={detailHeading} tabIndex={-1}>{selected.name}</h2><a className="crm-email-link" href={`mailto:${selected.email}`}><Mail size={14}/>{selected.email}</a></div><button className="icon-button" disabled={busy} aria-label="Close lead details" onClick={() => { if ((notes !== selected.notes || leadStatus !== selected.status) && !window.confirm("Discard the unsaved changes to this lead?")) return; setSelected(null); }}><X size={18}/></button></div>
        <dl className="growth-lead-facts"><div><dt>Interested in</dt><dd>{selected.productTitle}</dd></div><div><dt>Source</dt><dd>{selected.source}</dd></div><div><dt>First signup</dt><dd>{new Date(selected.createdAt).toLocaleString()}</dd></div><div><dt>Latest signup</dt><dd>{new Date(selected.lastSeenAt).toLocaleString()}</dd></div><div><dt>Marketing consent</dt><dd>{selected.marketing ? `Opted in ${selected.consentAt ? new Date(selected.consentAt).toLocaleString() : ""}` : "Not opted in"}</dd></div></dl>
        <fieldset className="growth-form-stack" disabled={busy}><label>Status<select value={leadStatus} onChange={e => setLeadStatus(e.target.value as LeadStatus)}>{leadStatuses.map(value => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}</select></label><label>Private notes<textarea rows={5} value={notes} maxLength={10000} onChange={e => setNotes(e.target.value)} placeholder="Add context and a next step for this person."/></label><div className="crm-save-row"><span>{dirty?'Unsaved changes':'All changes saved'}</span><button className="button primary" disabled={notes === selected.notes && leadStatus === selected.status} onClick={() => void saveLead()}>{busy ? <><Loader2 className="spin" size={15}/>Saving…</> : 'Save contact'}</button></div></fieldset>
        <div className="growth-follow-up"><h3>Personal follow-up</h3><p>Use your product’s saved draft, then review and send it from your email app.</p><button className="button secondary" disabled={busy} onClick={() => void draftFollowUp()}>Show follow-up draft</button>{followUp && <><textarea aria-label="Saved product follow-up draft" rows={9} value={followUp} readOnly/><button className="button secondary" disabled={busy} onClick={() => void navigator.clipboard.writeText(followUp).then(() => setNotice("Draft copied. Review and send it from your email app.")).catch(() => setError("Could not copy. Select and copy the text manually."))}><Copy size={15}/>Copy draft</button></>}</div>
      </aside>}</div>
    </div>
  </section>;
}
export default GrowthCRM;
