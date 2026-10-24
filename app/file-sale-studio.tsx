'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, CheckCircle2, Copy, ExternalLink, Eye, FileText, ImagePlus, Loader2, Megaphone, Plus, RefreshCw, ShieldCheck, Upload, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FileSalePageView } from './file-sale-page-view';
import { WorkspaceNavigation } from './workspace-navigation';
import { WorkspaceProductRail, WorkspaceProductSidebar, type ProductArea } from './workspace-product-navigation';
import type {Product} from '@/lib/product';
import {clearWorkspaceDrafts} from '@/lib/workspace-drafts';
import { productPresets, productPreset, type ProductPresetId } from '@/lib/product-presets';
import type { FileSaleWorkspace, SaleDraft, SaleModule, SaleModuleKind, SaleUpload } from '@/lib/file-sale-contract';
import './file-sale-studio.css';

const stages = ['Product', 'Sell', 'Review'] as const;
const newModule = (kind: SaleModuleKind): SaleModule => ({ kind, name: kind === 'downloads' ? 'Downloads' : 'Course', included: false, uploadIds: [], sections: [] });
const startingDraft = (): SaleDraft => ({ title: '', description: '', currency: 'usd', priceCents: 1900, modules: [newModule('downloads')] });
const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const sizeLabel = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;

async function api<T>(url: string, body?: unknown, method = body ? 'POST' : 'GET'): Promise<T> {
  const response = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const result = await response.json() as T & { error?: string };
  if (response.status === 401 || response.status === 428) {
    location.assign(`/welcome?return_to=${encodeURIComponent(location.pathname + location.search)}`);
    throw new Error('Sign in to continue.');
  }
  if (!response.ok) throw new Error(result.error || 'This step could not be completed. Your saved draft is safe.');
  return result as T;
}

function track(productId: string, event: 'draft_resumed' | 'preview_opened' | 'sales_link_copied', detail: Record<string, string> = {}) {
  // Analytics are deliberately limited to lifecycle enums, never files, URLs,
  // descriptions, emails, or buyer access tokens.
  void fetch(`/api/products/${encodeURIComponent(productId)}/sale/events`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, eventId: crypto.randomUUID(), detail }),
  }).catch(() => {});
}

export default function FileSaleStudio({ initialId, publishingEnabled, user=null }: { initialId: string; publishingEnabled: boolean; user?:{name:string;email:string}|null }) {
  const [workspace, setWorkspace] = useState<FileSaleWorkspace | null>(null);
  const [draft, setDraft] = useState<SaleDraft>(startingDraft);
  const [baseline, setBaseline] = useState(JSON.stringify(startingDraft()));
  const [preset, setPreset] = useState<ProductPresetId>('playbook');
  const [stage, setStage] = useState(0);
  const [loading, setLoading] = useState(initialId !== 'new');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [preview, setPreview] = useState<SaleDraft | null>(null);
  const [upload, setUpload] = useState<{ name: string; percent: number; processing: boolean } | null>(null);
  const [grants, setGrants] = useState<SaleModuleKind[]>([]);
  const [shared, setShared] = useState(false);
  const [copyFallback, setCopyFallback] = useState(false);
  const busyRef = useRef(false);
  const leaving = useRef(false);
  const [navigation,setNavigation]=useState<{products:Product[];admin:boolean;credits:{total:number;unlimited?:boolean}}|null>(null);
  const [history,setHistory]=useState<{id:string;title:string}[]>([]);
  const creationRequestId = useRef(crypto.randomUUID());
  const heading = useRef<HTMLHeadingElement>(null);
  const dirty = JSON.stringify(draft) !== baseline;
  const salesUrl = workspace ? `/p/${encodeURIComponent(workspace.product.slug)}` : '';
  const newlyIncluded = draft.modules.filter(feature => feature.included && !workspace?.publishedSnapshot?.modules.some(prior => prior.kind === feature.kind && prior.included));
  const uploads = workspace?.uploads || [];

  function receive(next: FileSaleWorkspace) {
    setWorkspace(next); setDraft(next.draft); setBaseline(JSON.stringify(next.draft));
  }
  useEffect(() => {
    const requestedStage=new URLSearchParams(location.search).get('stage');
    if(requestedStage&&['0','1','2'].includes(requestedStage))setStage(Number(requestedStage));
    if (initialId === 'new') return;
    let active = true;
    void api<FileSaleWorkspace>(`/api/products/${encodeURIComponent(initialId)}/sale`).then(next => { if (active) { receive(next); track(next.product.id, 'draft_resumed', { stage: 'product' }); } }).catch(reason => { if (active) setError(reason.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [initialId]);
  useEffect(()=>{
    let active=true;
    void Promise.allSettled([
      api<{products:Product[];admin:boolean;credits:{total:number;unlimited?:boolean}}>('/api/workspace'),
      api<{conversations:{id:string;title:string}[]}>('/api/studio/conversations'),
    ]).then(([workspaceResult,historyResult])=>{
      if(!active)return;
      if(workspaceResult.status==='fulfilled')setNavigation(workspaceResult.value);
      if(historyResult.status==='fulfilled')setHistory(historyResult.value.conversations);
    });
    return()=>{active=false;};
  },[]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (!leaving.current&&(dirty || busy)) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, busy]);

  function updateModule(kind: SaleModuleKind, change: Partial<SaleModule>) {
    setDraft(current => ({ ...current, modules: current.modules.map(feature => feature.kind === kind ? { ...feature, ...change } : feature) }));
  }
  function reorder(kind: SaleModuleKind, direction: number) {
    setDraft(current => {
      const index = current.modules.findIndex(feature => feature.kind === kind), next = index + direction;
      if (index < 0 || next < 0 || next >= current.modules.length) return current;
      const modules = [...current.modules]; [modules[index], modules[next]] = [modules[next], modules[index]];
      return { ...current, modules };
    });
  }
  async function create(): Promise<FileSaleWorkspace> {
    if (workspace) return workspace;
    const created = await api<FileSaleWorkspace>('/api/file-sales', { preset, requestId: creationRequestId.current });
    receive(created);
    window.history.replaceState(null, '', `/sell/${encodeURIComponent(created.product.id)}`);
    return created;
  }
  async function saveDraft(): Promise<FileSaleWorkspace> {
    const current = await create();
    if (!dirty && workspace) return current;
    const saved = await api<FileSaleWorkspace>(`/api/products/${current.product.id}/sale`, { expectedVersion: current.version, draft }, 'PATCH');
    receive(saved); return saved;
  }
  async function run(label: string, action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(label); setError(''); setNotice('');
    try { await action(); } catch (reason) { setError((reason as Error).message); }
    finally { busyRef.current = false; setBusy(''); }
  }
  async function moveTo(next: number) {
    await run('Saving draft', async () => { const saved=await saveDraft(); setStage(next); window.history.replaceState(null,'',`/sell/${encodeURIComponent(saved.product.id)}?stage=${next}`); heading.current?.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }
  async function navigateTo(path:string,signOut=false){
    if(busyRef.current){setError('Finish the current upload or save before leaving. Your draft stays open here.');window.scrollTo({top:0,behavior:'smooth'});return;}
    const leave=()=>{leaving.current=true;if(signOut)clearWorkspaceDrafts();location.assign(path);};
    if(dirty){await run('Saving before leaving',async()=>{await saveDraft();leave();});if(!leaving.current)window.scrollTo({top:0,behavior:'smooth'});return;}
    leave();
  }
  const selectedProduct:Product|null=workspace?{
    ...(navigation?.products.find(product=>product.id===workspace.product.id)||{
      id:workspace.product.id,slug:workspace.product.slug,title:draft.title||'Your product',description:draft.description,audience:'',
      format:workspace.product.format as Product['format'],price:draft.priceCents/100,color:'orange',status:'draft',
      content:{sections:[],benefits:[],launch:'',files:[]},createdAt:0,updatedAt:0,
    }),title:draft.title||'Your product',description:draft.description,
  }:null;
  const navigationProducts=selectedProduct?[selectedProduct,...(navigation?.products||[]).filter(product=>product.id!==selectedProduct.id)]:(navigation?.products||[]);
  const productHome=(options='')=>workspace?`/?project=${encodeURIComponent(workspace.product.id)}&area=page${options}`:'/?view=library';
  function selectProduct(id:string){void navigateTo(`/?project=${encodeURIComponent(id)}&area=page`);}
  function selectArea(area:ProductArea){
    if(area==='content'||area==='files'||area==='media'){void moveTo(0);return;}
    if(area==='commerce'){void moveTo(1);return;}
    void navigateTo(area==='page'?productHome():`/?project=${encodeURIComponent(workspace!.product.id)}&area=${area}`);
  }
  function shell(children:ReactNode){return <div className={`file-sale-app gen-app file-sale-workspace ${selectedProduct?'has-selected-product':''} ${navigationProducts.length?'has-product-rail':''}`}>
    <WorkspaceNavigation user={user} view="library" label={draft.title||'File product'} admin={!!navigation?.admin} products={navigationProducts}
      creditsLabel={navigation?.credits.unlimited?'Unlimited':navigation?`${navigation.credits.total.toLocaleString()} credits`:'AI credits'} history={history}
      onHome={()=>void navigateTo('/')} onCreate={()=>void navigateTo('/?view=create')} onView={view=>void navigateTo('/?view='+view)}
      onProduct={selectProduct} onConversation={id=>void navigateTo('/?conversation='+encodeURIComponent(id))} onVisit={path=>void navigateTo(path)} onSignOut={()=>void navigateTo('/signout-with-chatgpt',true)}/>
    <div className={`workspace-shell ${selectedProduct?'has-product':''}`}><WorkspaceProductRail products={navigationProducts} selectedId={selectedProduct?.id} onProduct={selectProduct} onLibrary={()=>void navigateTo('/?view=library')} onCreate={()=>void navigateTo('/?view=create')}/>
      {selectedProduct&&<WorkspaceProductSidebar product={selectedProduct} products={navigationProducts} tab={stage===0?'content':'commerce'} mode="creator" onProduct={selectProduct} onTab={selectArea} onMode={mode=>void navigateTo(productHome('&mode='+mode))} onCustomize={()=>void navigateTo(productHome('&customize=1'))} onReviews={()=>void navigateTo(productHome('&tab=reviews'))}/>}
      <div className="workspace-stage">{children}</div>
    </div>
  </div>;}
  async function refresh() {
    await run('Checking readiness', async () => {
      const saved = await saveDraft();
      const fresh = await api<FileSaleWorkspace>(`/api/products/${saved.product.id}/sale`);
      receive(fresh); setNotice('Readiness checked. Your draft is saved.');
    });
  }
  async function selectPreset(value: ProductPresetId) {
    setPreset(value);
    const selected = productPreset(value);
    if (!workspace && selected?.available) setDraft(current => ({ ...current, modules: [newModule(selected.family === 'course' ? 'course' : 'downloads')] }));
  }
  async function uploadFile(file: File, kind: 'downloads' | 'cover' | 'video', lessonId?: string) {
    if (busyRef.current) return;
    if (file.size < 1 || file.size > 100 * 1024 * 1024) { setError('Choose a file between 1 byte and 100 MB.'); return; }
    if (kind === 'cover' && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError('Choose a PNG, JPEG, or WebP cover.'); return; }
    if (kind === 'video' && !['video/mp4', 'video/webm'].includes(file.type)) { setError('Choose an MP4 or WebM recording.'); return; }
    await run('Uploading file', async () => {
      const unsavedDraft = draft;
      const current = workspace ? await saveDraft() : await create();
      setUpload({ name: file.name, percent: 0, processing: false });
      try {
        const ready = await new Promise<SaleUpload>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `/api/products/${current.product.id}/uploads?name=${encodeURIComponent(file.name)}`);
          xhr.setRequestHeader('Content-Type', file.type || (/\.pdf$/i.test(file.name) ? 'application/pdf' : 'application/octet-stream'));
          xhr.setRequestHeader('X-File-Size', String(file.size));
          xhr.upload.onprogress = event => { if (event.lengthComputable) setUpload({ name: file.name, percent: Math.round(event.loaded * 100 / event.total), processing: false }); };
          xhr.upload.onload = () => setUpload({ name: file.name, percent: 100, processing: true });
          xhr.onerror = () => reject(new Error('Upload interrupted. Retry the file; your other content is saved.'));
          xhr.onabort = () => reject(new Error('Upload cancelled. Your other content is saved.'));
          xhr.onload = () => { try { const result = JSON.parse(xhr.responseText); if (xhr.status < 200 || xhr.status >= 300) throw new Error(result.error || 'File validation failed. Choose a supported file and retry.'); resolve(result.upload); } catch (reason) { reject(reason); } };
          xhr.send(file);
        });
        setWorkspace(previous => previous ? { ...previous, uploads: [ready, ...previous.uploads.filter(item => item.id !== ready.id)] } : previous);
        const source = workspace ? current.draft : unsavedDraft;
        const next: SaleDraft = { ...source, modules: source.modules.map(feature => ({ ...feature, uploadIds: [...feature.uploadIds], sections: [...feature.sections] })) };
        if (kind === 'cover') next.coverUploadId = ready.id;
        if (kind === 'downloads') {
          let feature = next.modules.find(item => item.kind === 'downloads');
          if (!feature) { feature = newModule('downloads'); next.modules.push(feature); }
          feature.uploadIds = [...new Set([...feature.uploadIds, ready.id])];
          if (!next.title.trim() || /^untitled/i.test(next.title)) next.title = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 100);
        }
        if (kind === 'video') {
          const course = next.modules.find(item => item.kind === 'course');
          if (course) course.sections = course.sections.map(section => section.id === lessonId ? { ...section, videoId: ready.id } : section);
        }
        setDraft(next);
        const saved = await api<FileSaleWorkspace>(`/api/products/${current.product.id}/sale`, { expectedVersion: current.version, draft: next }, 'PATCH');
        receive(saved); setNotice(`${file.name} is uploaded, validated, and attached to your saved draft.`);
      } finally { setUpload(null); }
    });
  }
  async function publish() {
    await run('Publishing test page', async () => {
      const saved = await saveDraft();
      const fresh = await api<FileSaleWorkspace>(`/api/products/${saved.product.id}/sale`);
      receive(fresh);
      if (!fresh.readiness.ready) { setError('Resolve the checks below before publishing. Your previous published version stays available.'); return; }
      const published = await api<FileSaleWorkspace>(`/api/products/${saved.product.id}/sale/publish`, { expectedVersion: fresh.version, grantModulesToExisting: grants.filter(kind => draft.modules.some(feature => feature.kind === kind && feature.included)) });
      receive(published); setShared(true); setGrants([]); setNotice('Your test sales page is published.');
    });
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(`${location.origin}${salesUrl}`); setNotice('Sales link copied.'); setCopyFallback(false); if (workspace) track(workspace.product.id, 'sales_link_copied', { stage: 'review' }); }
    catch { setCopyFallback(true); setNotice('Select and copy your sales link below.'); }
  }
  function previewModule(feature: SaleModule) { setPreview({ ...draft, modules: [{ ...feature, included: true }] }); if (workspace) track(workspace.product.id, 'preview_opened', { stage: 'product', module: feature.kind }); }
  function previewProduct() { setPreview(draft); if (workspace) track(workspace.product.id, 'preview_opened', { stage: 'review' }); }

  if (loading) return shell(<main id="workspace-content" tabIndex={-1} className="file-sale-loading"><Loader2 className="spin" size={28}/><p>Opening your saved product…</p></main>);
  if (!workspace && initialId !== 'new') return shell(<main id="workspace-content" tabIndex={-1} className="file-sale-loading"><h1>We couldn’t open this product.</h1><p role="alert">{error}</p><button className="button secondary" onClick={()=>void navigateTo('/')}>Return to your workspace</button></main>);

  return shell(<>
    <header className="file-sale-topbar"><span className="file-sale-environment"><ShieldCheck size={14}/>{publishingEnabled ? 'Sandbox sales preview' : 'Private product workspace'}</span>{workspace&&<button type="button" className="text-link" onClick={()=>void navigateTo(productHome())}><Eye size={14}/>Product home</button>}{workspace&&<button type="button" className="text-link file-sale-marketing" onClick={()=>void navigateTo(`/?project=${encodeURIComponent(workspace.product.id)}&area=dashboard`)}><Megaphone size={14}/>Marketing</button>}</header>
    <main className="file-sale-main" id="workspace-content" tabIndex={-1}>
      <div className="file-sale-heading"><div><h1 ref={heading} tabIndex={-1}>{stage === 0 ? (draft.title || 'Create from your files') : stage === 1 ? 'Price & delivery' : 'Review your product'}</h1><p>{stage === 0 ? 'Upload your file, add the essentials, and build around it.' : stage === 1 ? 'Choose a price and exactly what a purchase includes.' : publishingEnabled ? 'See what buyers see. Check the details, then publish your test page.' : 'Preview your product and save the offer for when publishing is available.'}</p></div><span className="file-sale-save-state" aria-live="polite">{busy ? <><Loader2 size={14} className="spin"/>{busy}…</> : dirty ? 'Unsaved changes' : workspace ? <><Check size={14}/>Draft saved</> : 'Nothing published yet'}</span></div>
      {!publishingEnabled && <div className="file-sale-availability" role="status"><ShieldCheck size={18}/><div><strong>Prepare your product now. Publishing is not enabled yet.</strong><p>Upload files, add a course, set your price, and preview your product. Your work stays private; publishing and payments for file products are not enabled yet.</p></div></div>}
      <nav className="file-sale-steps" aria-label="Product setup">{stages.map((label, index) => <button type="button" key={label} aria-current={index === stage ? 'step' : undefined} disabled={!!busy} className={index === stage ? 'active' : ''} onClick={() => void moveTo(index)}><span>{index + 1}</span>{label}<ArrowRight size={15}/></button>)}</nav>
      {error && <div className="file-sale-alert" role="alert"><div><strong>This step needs attention.</strong><p>{error}</p></div>{workspace && <button className="text-link" disabled={!!busy} onClick={() => void run('Reloading saved draft', async () => { const fresh = await api<FileSaleWorkspace>(`/api/products/${workspace.product.id}/sale`); receive(fresh); setNotice('Saved draft reloaded.'); })}>Reload saved version <RefreshCw size={14}/></button>}</div>}
      {notice && <p className="file-sale-notice" role="status"><CheckCircle2 size={16}/>{notice}</p>}
      {upload && <div className="file-sale-upload-progress" aria-live="polite"><div><Loader2 className="spin" size={17}/><strong>{upload.processing ? 'Validating and storing' : 'Uploading'} {upload.name}</strong><span>{upload.percent}%</span></div><progress value={upload.percent} max={100}/><p>{upload.processing ? 'A completed transfer becomes ready only after the server validates it.' : 'Keep this page open until the file is ready.'}</p></div>}

      {stage === 0 && <fieldset className="file-sale-grid" disabled={!!busy}>
        <div className="file-sale-primary">
          {!workspace && <section className="file-sale-card file-sale-preset"><label htmlFor="sale-preset">Starting point</label><select id="sale-preset" value={preset} onChange={event => void selectPreset(event.target.value as ProductPresetId)}>{productPresets.map(item => <option key={item.id} value={item.id} disabled={!item.available}>{item.label}{!item.available ? ' · unavailable in this preview' : ''}</option>)}</select><p>{productPreset(preset)?.description} You can add supported features later.</p></section>}
          <section className="file-sale-card"><div className="file-sale-section-heading"><div><h2>Product contents</h2></div><button className="button secondary" type="button" onClick={() => setFeaturesOpen(true)}><Plus size={16}/>Add features</button></div>
            <div className="file-sale-modules">{draft.modules.map((feature, index) => <section className="file-sale-module" key={feature.kind} aria-label={`${feature.name} feature`}>
              <header><div className="file-sale-module-icon">{feature.kind === 'downloads' ? <FileText size={20}/> : <BookOpen size={20}/>}</div><div><h3>{feature.name}</h3><span>{workspace?.publishedSnapshot?.modules.some(item => item.kind === feature.kind && item.included) ? 'Published version preserved · editing draft' : 'Draft feature'} · {feature.included ? 'Included in next offer' : 'Private until included'}</span></div><div className="file-sale-module-actions"><button type="button" className="icon-button" aria-label={`Move ${feature.name} up`} disabled={index === 0} onClick={() => reorder(feature.kind, -1)}><ArrowUp size={16}/></button><button type="button" className="icon-button" aria-label={`Move ${feature.name} down`} disabled={index === draft.modules.length - 1} onClick={() => reorder(feature.kind, 1)}><ArrowDown size={16}/></button><button type="button" className="icon-button" aria-label={`Preview ${feature.name}`} onClick={() => previewModule(feature)}><Eye size={17}/></button></div></header>
              {feature.kind === 'downloads' ? <><label className="file-sale-drop"><Upload size={30}/><strong>{feature.uploadIds.length ? 'Add another file' : 'Choose your finished file'}</strong><span>PDF, PNG, JPEG, WebP, TXT or CSV · up to 100 MB each</span><small>Original files stay private. No AI generation or transcription required.</small><input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,application/pdf" aria-label="Upload a downloadable file" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void uploadFile(file, 'downloads'); }}/></label><div className="file-sale-file-list">{feature.uploadIds.map(id => { const file = uploads.find(item => item.id === id); return <div key={id}><FileText size={19}/><div><strong>{file?.name || 'File needs review'}</strong><span>{file ? `${sizeLabel(file.size)} · ${file.status === 'completed' ? 'Stored privately' : file.status}` : 'Save and refresh to check this attachment'}</span></div><button type="button" className="icon-button" aria-label={`Detach ${file?.name || 'file'} from this draft`} onClick={() => updateModule(feature.kind, { uploadIds: feature.uploadIds.filter(value => value !== id) })}><X size={16}/></button></div>; })}</div>{uploads.some(file => file.status === 'completed' && !file.mime.startsWith('video/') && file.id !== draft.coverUploadId && !feature.uploadIds.includes(file.id)) && <details className="file-sale-feature-settings"><summary>Attach a file already uploaded</summary><p>Recover a stored file after an interrupted save, or restore a file removed from this draft.</p>{uploads.filter(file => file.status === 'completed' && !file.mime.startsWith('video/') && file.id !== draft.coverUploadId && !feature.uploadIds.includes(file.id)).map(file => <button type="button" className="button secondary" key={file.id} onClick={() => updateModule('downloads', { uploadIds: [...feature.uploadIds, file.id] })}><Plus size={14}/>{file.name}</button>)}</details>}</> : <div className="file-sale-course"><p>Write lessons or attach recordings you have created. Adding a course does not change your price or grant access.</p>{feature.sections.map((section, lessonIndex) => <article className="file-sale-lesson" key={section.id || lessonIndex}><div className="file-sale-lesson-heading"><span>LESSON {lessonIndex + 1}</span><button type="button" className="icon-button" aria-label={`Remove lesson ${lessonIndex + 1} from draft`} onClick={() => updateModule('course', { sections: feature.sections.filter((_, i) => i !== lessonIndex) })}><X size={15}/></button></div><label>Lesson title<input maxLength={150} value={section.title} onChange={event => updateModule('course', { sections: feature.sections.map((item, i) => i === lessonIndex ? { ...item, title: event.target.value } : item) })}/></label><label>Lesson notes<textarea rows={5} maxLength={18000} value={section.body} placeholder="Teach one useful step. A text-only lesson is welcome." onChange={event => updateModule('course', { sections: feature.sections.map((item, i) => i === lessonIndex ? { ...item, body: event.target.value } : item) })}/></label>{section.videoId && <div className="file-sale-attached-video"><CheckCircle2 size={15}/><span>{uploads.find(file => file.id === section.videoId)?.name || 'Recording attached'}</span><button type="button" className="text-link" onClick={() => updateModule('course', { sections: feature.sections.map((item, i) => i === lessonIndex ? { ...item, videoId: undefined } : item) })}>Detach</button></div>}<label className="button secondary file-sale-upload-button"><Upload size={15}/>{section.videoId ? 'Replace recording' : 'Upload recording'}<input type="file" accept="video/mp4,video/webm" aria-label={`Upload recording for lesson ${lessonIndex + 1}`} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void uploadFile(file, 'video', section.id); }}/></label><small>Optional MP4 or WebM · 100 MB maximum. No video is generated.</small></article>)}<button type="button" className="button secondary" disabled={feature.sections.length >= 30} onClick={() => updateModule('course', { sections: [...feature.sections, { id: crypto.randomUUID(), title: `Lesson ${feature.sections.length + 1}`, body: '' }] })}><Plus size={15}/>Add lesson</button></div>}
              <details className="file-sale-feature-settings"><summary>Feature settings</summary><label>Feature name<input value={feature.name} maxLength={100} onChange={event => updateModule(feature.kind, { name: event.target.value })}/></label><p>Order changes use the arrow buttons above. Detaching content edits this draft; it does not delete stored files or previous purchases.</p><button className="button secondary" type="button" disabled={draft.modules.length === 1} onClick={() => { setDraft(current => ({ ...current, modules: current.modules.filter(item => item.kind !== feature.kind) })); setNotice(`${feature.name} removed from this draft. Stored files and previously purchased access are preserved.`); }}>Remove feature from draft</button>{draft.modules.length === 1 && <p>Keep at least one feature in this product.</p>}</details>
            </section>)}</div>
          </section>
        </div>
        <aside className="file-sale-secondary"><section className="file-sale-card"><h2>Product details</h2><label htmlFor="sale-title">Product name<input id="sale-title" value={draft.title} maxLength={100} placeholder="The Freelancer’s Client Playbook" onChange={event => setDraft({ ...draft, title: event.target.value })}/></label><label htmlFor="sale-description">Short description<textarea id="sale-description" rows={5} maxLength={12000} value={draft.description} placeholder="Who is this for, what will it help them do, and what do they receive?" onChange={event => setDraft({ ...draft, description: event.target.value })}/></label><label className="button secondary file-sale-upload-button"><ImagePlus size={16}/>{draft.coverUploadId ? 'Replace cover' : 'Add a cover · optional'}<input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload optional product cover" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void uploadFile(file, 'cover'); }}/></label>{draft.coverUploadId && <div className="file-sale-cover-note"><span>{uploads.find(file => file.id === draft.coverUploadId)?.name || 'Cover attached'}</span><button type="button" className="text-link" onClick={() => setDraft({ ...draft, coverUploadId: undefined })}>Remove from draft</button></div>}</section><div className="file-sale-side-note"><ShieldCheck size={20}/><p>Everything here starts private. You choose what to include and publish after reviewing your offer.</p></div></aside>
      </fieldset>}

      {stage === 1 && <fieldset className="file-sale-grid" disabled={!!busy}><div className="file-sale-primary"><section className="file-sale-card"><span className="file-sale-eyebrow">ONE-TIME PURCHASE</span><h2>A price for the complete offer.</h2><div className="file-sale-price"><label htmlFor="sale-price">Price in USD<input id="sale-price" type="number" inputMode="decimal" min="0.50" max="9999" step="0.01" value={draft.priceCents / 100} onChange={event => setDraft({ ...draft, priceCents: Math.max(0, Math.round(Number(event.target.value) * 100)) })}/></label><span>USD · paid once</span></div><p>Free offers and recurring product payments are not available in this preview.</p></section><section className="file-sale-card"><span className="file-sale-eyebrow">DELIVERY</span><h2>Choose what this purchase includes.</h2><p>Only selected, ready features enter the published offer. Other features remain private drafts.</p><div className="file-sale-inclusions">{draft.modules.map(feature => <label key={feature.kind}><input type="checkbox" checked={feature.included} onChange={event => updateModule(feature.kind, { included: event.target.checked })}/><div><strong>{feature.name}</strong><span>{feature.kind === 'downloads' ? `${feature.uploadIds.length} original file${feature.uploadIds.length === 1 ? '' : 's'} for private download` : `${feature.sections.length} self-paced lesson${feature.sections.length === 1 ? '' : 's'}`}</span></div><span className="file-sale-feature-label">{feature.included ? 'Included' : 'Private draft'}</span></label>)}</div></section></div><aside className="file-sale-secondary"><section className="file-sale-card"><span className="file-sale-eyebrow">PAYMENT READINESS</span><h2>{!publishingEnabled ? 'Your draft is safe.' : workspace?.readiness.payments.state === 'eligible' ? 'Test checkout is eligible.' : 'Let’s check your checkout.'}</h2><p>{workspace?.readiness.payments.message || 'Save your draft to check payment readiness.'}</p><span className={`file-sale-payment-state ${workspace?.readiness.payments.state === 'eligible' ? 'eligible' : ''}`}>{publishingEnabled ? `${workspace?.readiness.payments.state.replaceAll('_', ' ') || 'Not checked'} · test mode` : 'Publishing unavailable'}</span><button type="button" className="button secondary" onClick={() => void refresh()}><RefreshCw size={16}/>Refresh readiness</button>{workspace?.readiness.payments.recovery === 'admin' && <p className="file-sale-note">{publishingEnabled ? 'The platform administrator must configure eligible sandbox payments. Your product stays saved while this is resolved.' : 'FiveGen must finish payment verification before file products can be published. You can keep editing and saving.'}</p>}{publishingEnabled && <p className="file-sale-note">Returning from a provider setup page does not prove eligibility. Refresh to verify the current provider state.</p>}</section><div className="file-sale-side-note"><CheckCircle2 size={20}/><p>{publishingEnabled ? 'Confirmed test payment creates private access. A purchase confirmation alone never exposes an unverified file.' : 'Your files remain private while you prepare the offer. Previewing does not publish a page or charge anyone.'}</p></div></aside></fieldset>}

      {stage === 2 && <div className="file-sale-grid"><div className="file-sale-primary"><section className="file-sale-card file-sale-review-preview"><div className="file-sale-section-heading"><div><span className="file-sale-eyebrow">BUYER’S VIEW</span><h2>Your sales page.</h2></div><button className="button secondary" disabled={!!busy} onClick={previewProduct}><Eye size={16}/>Full preview</button></div><FileSalePageView snapshot={draft} preview coverUrl={draft.coverUploadId ? `/api/uploads/${draft.coverUploadId}` : undefined}/></section><section className="file-sale-card"><h2>Review what changes.</h2><div className="file-sale-change-list"><div><span>Price</span><strong>{workspace?.publishedSnapshot && workspace.publishedSnapshot.priceCents !== draft.priceCents ? `${dollars(workspace.publishedSnapshot.priceCents)} → ` : ''}{dollars(draft.priceCents)} USD, once</strong></div>{draft.modules.map((feature, index) => <div key={feature.kind}><span>{index + 1}. {feature.name}</span><strong>{feature.included ? workspace?.publishedSnapshot?.modules.some(item => item.kind === feature.kind && item.included) ? 'Included · updated draft' : 'Newly included' : 'Private draft · excluded'}</strong></div>)}</div><p>Included files and lessons are captured when checkout starts. A later publication does not change an in-progress purchase.</p>{!!workspace?.readiness.existingBuyerCount && <div className="file-sale-existing-access"><strong>{workspace.readiness.existingBuyerCount} existing buyer{workspace.readiness.existingBuyerCount === 1 ? '' : 's'}</strong><p>Published download updates follow the existing-buyer delivery policy. Adding a new feature does not grant access automatically.</p>{newlyIncluded.map(feature => <label key={feature.kind}><input type="checkbox" checked={grants.includes(feature.kind)} onChange={event => setGrants(current => event.target.checked ? [...new Set([...current, feature.kind])] : current.filter(kind => kind !== feature.kind))}/><span>Also give existing buyers access to {feature.name}. Leave unchecked to include it only in future purchases.</span></label>)}</div>}</section></div><aside className="file-sale-secondary"><section className="file-sale-card"><span className="file-sale-eyebrow">READY TO PUBLISH?</span><h2>Every important detail, checked.</h2><div className="file-sale-checklist">{workspace?.readiness.checks.map(check => <button key={check.key} className={check.ready ? 'ready' : 'blocked'} type="button" disabled={!!busy} onClick={() => check.stage === 'review' ? void refresh() : void moveTo(check.stage === 'product' ? 0 : 1)}>{check.ready ? <CheckCircle2 size={18}/> : <span className="file-sale-check-dot"/>}<span><strong>{check.key[0].toUpperCase() + check.key.slice(1)}</strong><small>{check.message}</small></span>{!check.ready && <ArrowRight size={15}/>}</button>)}</div><button className="button secondary" disabled={!!busy} onClick={() => void refresh()}><RefreshCw size={15}/>Check again</button><p className="file-sale-note">Publishing repeats these checks on the server. A failed update leaves the previous published page intact.</p></section>{workspace?.publishedRevisionId && <section className="file-sale-card file-sale-share"><CheckCircle2 size={24}/><h2>{shared ? 'Your test page is ready.' : 'Your published test page.'}</h2><p>Share this link for an authorized sandbox walkthrough. No live payments are enabled here.</p><button className="button primary" onClick={() => void copyLink()}><Copy size={16}/>Copy sales link</button><a className="button secondary" href={salesUrl} target="_blank" rel="noreferrer">View published page <ExternalLink size={15}/></a>{copyFallback && <label>Sales link<input readOnly value={typeof location === 'undefined' ? salesUrl : `${location.origin}${salesUrl}`} onFocus={event => event.target.select()}/></label>}</section>}</aside></div>}
    </main>
    <footer className="file-sale-actionbar"><div><button type="button" className="button secondary" disabled={!!busy} onClick={() => stage ? void moveTo(stage - 1) : void navigateTo('/?view=library')}><ArrowLeft size={16}/>{stage ? 'Back' : 'Save & exit'}</button><span>{stage + 1} of 3 · {draft.modules.filter(feature => feature.included).length} feature{draft.modules.filter(feature => feature.included).length === 1 ? '' : 's'} included</span></div><div><button type="button" className="button secondary" disabled={!!busy || (!dirty && !!workspace)} onClick={() => void run('Saving draft', async () => { await saveDraft(); setNotice('Draft saved. You can return to this product anytime.'); })}>Save draft</button>{stage < 2 ? <button type="button" className="button primary" disabled={!!busy} onClick={() => void moveTo(stage + 1)}>{busy ? <Loader2 size={16} className="spin"/> : null}{stage === 0 ? 'Continue to pricing' : publishingEnabled ? 'Review & publish' : 'Review product'}<ArrowRight size={16}/></button> : <button type="button" className="button primary" disabled={!publishingEnabled || !!busy || !workspace?.readiness.ready || dirty} onClick={() => void publish()}>{busy ? <Loader2 size={16} className="spin"/> : <CheckCircle2 size={16}/>} {!publishingEnabled ? 'Publishing unavailable' : workspace?.publishedRevisionId ? 'Publish test update' : 'Publish test page'}</button>}</div></footer>

    <Dialog open={featuresOpen} onOpenChange={setFeaturesOpen}><DialogContent className="file-sale-dialog"><DialogHeader><DialogTitle>Add features to this product</DialogTitle><DialogDescription>These are built-in features. They do not create another product, change your price, or connect an external account.</DialogDescription></DialogHeader><div className="file-sale-feature-catalog">{(['downloads', 'course'] as const).map(kind => { const attached = draft.modules.some(feature => feature.kind === kind); return <button key={kind} disabled={attached || !!busy} onClick={() => { setDraft(current => current.modules.some(feature => feature.kind === kind) ? current : { ...current, modules: [...current.modules, newModule(kind)] }); setFeaturesOpen(false); setNotice(`${kind === 'course' ? 'Course' : 'Downloads'} added as a private draft. Include it in your offer only when it is ready.`); }}>{kind === 'downloads' ? <FileText size={25}/> : <BookOpen size={25}/>}<span><strong>{kind === 'downloads' ? 'Downloads' : 'Course'}</strong><small>{kind === 'downloads' ? 'Deliver original files through private buyer access.' : 'Create self-paced text lessons with optional uploaded recordings.'}</small><small>No AI credits used to attach or edit.</small></span>{attached ? <Check size={18}/> : <Plus size={18}/>}</button>; })}</div><p className="file-sale-note">Bookings, communities, cohort scheduling, and third-party integrations are not offered in this preview.</p></DialogContent></Dialog>
    <Dialog open={!!preview} onOpenChange={open => { if (!open) setPreview(null); }}><DialogContent className="file-sale-dialog file-sale-preview-dialog"><DialogHeader><DialogTitle>Private buyer preview</DialogTitle><DialogDescription>Review the current draft. Checkout is disabled in this preview.</DialogDescription></DialogHeader>{preview && <><FileSalePageView snapshot={preview} preview coverUrl={preview.coverUploadId ? `/api/uploads/${preview.coverUploadId}` : undefined}/><div className="file-sale-private-content">{preview.modules.filter(feature => feature.included).map(feature => <section key={feature.kind}><h3>{feature.name}</h3>{feature.kind === 'downloads' ? feature.uploadIds.map(id => <a key={id} href={`/api/uploads/${id}?download=1`} target="_blank" rel="noreferrer"><FileText size={16}/>{uploads.find(file => file.id === id)?.name || 'View attached file'}<ExternalLink size={13}/></a>) : feature.sections.map((lesson, index) => <article key={lesson.id || index}><h4>{lesson.title}</h4>{lesson.videoId && <video controls playsInline preload="metadata" src={`/api/uploads/${lesson.videoId}`}/>}<div>{lesson.body || 'No lesson notes yet.'}</div></article>)}</section>)}</div></>}<button className="button secondary" onClick={() => setPreview(null)}>Back to editing</button></DialogContent></Dialog>
  </>);
}
