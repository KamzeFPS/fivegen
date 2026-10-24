'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Clipboard, Loader2, Mic, Save, Sparkles } from 'lucide-react';
import type { Product } from '@/lib/product';
import { growthQuestions, missingGrowthAnswers, type Growth, type GrowthAssets,type GrowthAssetProposal } from '@/lib/growth';

import {CreatorContextPicker} from './creator-context-picker';
import {MarketingVersionHistory} from './marketing-version-history';
import {useRegisterEditorSave} from './editor-save-registry';
import {SalesRecordingPicker} from './sales-recording-picker';

type Props = { product: Product; aiReady: boolean; cost: number; unlimited: boolean; onUpdate?: () => void; onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void };
async function growthRequest(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json() as { growth: Growth; error?: string };
  if (!response.ok) throw new Error(data.error || 'Your growth workspace could not be updated. Please try again.');
  return data.growth;
}
export function GrowthVSL(props: Props) {
  return <GrowthVSLWorkspace key={props.product.id} {...props} />;
}
function GrowthVSLWorkspace({ product, aiReady, cost, unlimited, onUpdate, onDirtyChange, onBusyChange }: Props) {
  const [growth, setGrowth] = useState<Growth | null>(null), [baseline, setBaseline] = useState('');
  const [busy, setBusy] = useState('loading'), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [contextDirty,setContextDirty]=useState(false),[historyBusy,setHistoryBusy]=useState(false);
  const [copied, setCopied] = useState(false), [retry, setRetry] = useState(0);
  const [proposal,setProposal]=useState<GrowthAssetProposal|null>(null),[applyMode,setApplyMode]=useState<'append'|'replace'>('append'),[recording,setRecording]=useState<string|null>(null),[savedRecording,setSavedRecording]=useState<string|null>(null),[recordingRevision,setRecordingRevision]=useState(0);
  const [recordingUploadBusy,setRecordingUploadBusy]=useState(false);
  const mounted = useRef(true), running = useRef(false);
  const dirtyCallback = useRef(onDirtyChange), updatedCallback = useRef(onUpdate), busyCallback = useRef(onBusyChange);
  useLayoutEffect(() => { dirtyCallback.current = onDirtyChange; updatedCallback.current = onUpdate; busyCallback.current = onBusyChange; }, [onDirtyChange, onUpdate, onBusyChange]);
  const dirty = !!growth && JSON.stringify(growth) !== baseline;
  useEffect(() => { dirtyCallback.current?.(dirty||contextDirty||recording!==savedRecording); }, [dirty,contextDirty,recording,savedRecording]);
  useEffect(() => { busyCallback.current?.(!!busy||historyBusy||recordingUploadBusy); }, [busy,historyBusy,recordingUploadBusy]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; dirtyCallback.current?.(false); busyCallback.current?.(false); }; }, []);
  useEffect(() => {
    const controller = new AbortController(), id = product.id;
    void growthRequest(`/api/products/${id}/growth`, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) { setGrowth(value); setBaseline(JSON.stringify(value)); }
    }).catch(reason => { if (!controller.signal.aborted) setError((reason as Error).message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(''); });
    return () => controller.abort();
  }, [product.id, retry]);
  function accept(value: Growth) {
    if (!mounted.current) return false;
    const next={...value,productFacts:value.productFacts||growth?.productFacts};setGrowth(next); setBaseline(JSON.stringify(next)); return true;
  }
  function manualAssets(): GrowthAssets {
    return { vsl: '', landing: { headline: product.title, subheadline: product.description.slice(0, 700), body: '', benefits: [], ctaLabel: 'Request details', thankYou: 'Thank you for your interest. Your request has been shared with the creator.' }, followUp: '' };
  }
  async function persist(value: Growth, id: string) {
    return growthRequest(`/api/products/${id}/growth`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief: value.brief, assets: value.assets, expectedUpdatedAt: value.updatedAt }) });
  }
  async function save() {
    if (!growth || running.current||historyBusy||recordingUploadBusy) return false;
    const id = product.id; running.current = true; setBusy('save'); setError(''); setNotice('');
    try { if (accept(await persist(growth, id))) { setNotice('Your brief and script are saved.'); updatedCallback.current?.(); return true; } return false; }
    catch (reason) { if (mounted.current) setError((reason as Error).message); return false; }
    finally { if (mounted.current) { running.current = false; setBusy(''); } }
  }
  async function generate() {
    if(!growth||running.current||historyBusy||recordingUploadBusy||contextDirty)return;running.current=true;setBusy('generate');setError('');setNotice('');
    try{const saved=dirty||!growth.updatedAt?await persist(growth,product.id):growth;if(!accept(saved))return;const response=await fetch(`/api/products/${product.id}/growth/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({asset:'vsl',expectedUpdatedAt:saved.updatedAt,requestId:crypto.randomUUID(),maxCredits:unlimited?0:cost})}),value=await response.json() as {proposal:GrowthAssetProposal;error?:string};if(!response.ok)throw new Error(value.error||'The script proposal could not be created.');if(mounted.current){setProposal(value.proposal);setApplyMode('append');setNotice('Script proposal ready. Your current script, pages and emails are unchanged. Review before appending or replacing.');updatedCallback.current?.();}}
    catch(reason){if(mounted.current)setError((reason as Error).message);}finally{running.current=false;if(mounted.current)setBusy('');}
  }
  async function applyProposal(){if(!proposal||!growth||dirty||contextDirty||running.current||recordingUploadBusy)return;running.current=true;setBusy('apply');setError('');try{const response=await fetch(`/api/products/${product.id}/growth/generate`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({proposalId:proposal.id,mode:applyMode})}),value=await response.json() as {growth:Growth;error?:string};if(!response.ok)throw new Error(value.error||'The script could not be applied.');if(accept(value.growth)){setProposal(null);setNotice('Reviewed script saved. Existing page and email drafts, live pages and approved email snapshots are unchanged.');}}catch(reason){if(mounted.current)setError((reason as Error).message);}finally{running.current=false;if(mounted.current)setBusy('');}}
  async function saveRecording(){if(running.current||recordingUploadBusy)return false;running.current=true;setBusy('recording');setError('');try{const response=await fetch(`/api/products/${product.id}/growth/publish`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({creatorVslUploadId:recording,expectedUpdatedAt:recordingRevision})}),value=await response.json() as {videoDraft:{creatorVslUploadId:string|null;updatedAt:number};error?:string};if(!response.ok)throw new Error(value.error||'The recording selection could not save.');setSavedRecording(value.videoDraft.creatorVslUploadId);setRecordingRevision(value.videoDraft.updatedAt);setNotice('Recording selected privately. Choose this same owned asset in a page video section, then publish the page separately.');return true;}catch(reason){setError((reason as Error).message);return false;}finally{running.current=false;if(mounted.current)setBusy('');}}
  useEffect(()=>{const controller=new AbortController();void fetch(`/api/products/${product.id}/growth/publish`,{signal:controller.signal,cache:'no-store'}).then(async response=>{if(!response.ok)return;const value=await response.json() as {videoDraft:{creatorVslUploadId:string|null;updatedAt:number}};if(!controller.signal.aborted&&value.videoDraft){setRecording(value.videoDraft.creatorVslUploadId);setSavedRecording(value.videoDraft.creatorVslUploadId);setRecordingRevision(value.videoDraft.updatedAt);}}).catch(()=>{});void fetch(`/api/products/${product.id}/growth/generate`,{signal:controller.signal,cache:'no-store'}).then(async response=>{if(!response.ok)return;const value=await response.json() as {proposals:GrowthAssetProposal[]};if(!controller.signal.aborted)setProposal(value.proposals?.find(item=>item.asset==='vsl')||null);}).catch(()=>{});return()=>controller.abort();},[product.id]);
  useRegisterEditorSave({label:'Sales recording draft',dirty:recording!==savedRecording,busy:!!busy||historyBusy||recordingUploadBusy,save:saveRecording,priority:21});
  useRegisterEditorSave({label:'VSL brief and script',dirty,busy:!!busy||historyBusy||recordingUploadBusy,save,priority:20});
  if (busy === 'loading') return <div className="growth-loading" role="status"><Loader2 className="spin" size={22} />Opening your growth brief…</div>;
  if (!growth) return <div className="growth-error" role="alert"><p>{error || 'Your growth workspace is unavailable.'}</p><button className="button secondary" onClick={() => { setBusy('loading'); setError(''); setRetry(value => value + 1); }}>Try again</button></div>;
  const missing = missingGrowthAnswers(growth.brief), spent = unlimited ? 'Included with your access' : `${cost} credits per run`;
  return <div className="growth-vsl">
    <div className="growth-panel-heading"><div><span className="growth-eyebrow">YOUR STORY. YOUR OFFER.</span><h2>Prepare your sales video.</h2><p>Tell your growth operator who you help and why your offer matters. Your shared offer brief guides the script. AI assistance and private references are optional; you bring your voice.</p></div><button className="button secondary" disabled={!!busy||historyBusy||recordingUploadBusy || (!dirty && growth.updatedAt > 0)} onClick={() => void save()}>{busy === 'save' ? <Loader2 size={15} className="spin" /> : <Save size={15} />}Save brief & script</button></div>
    {error && <div className="growth-error" role="alert">{error}</div>}
    {notice && <div className="growth-notice" role="status"><Check size={17} />{notice}</div>}
    <CreatorContextPicker productId={product.id} disabled={!!busy||historyBusy||recordingUploadBusy} onDirtyChange={setContextDirty}/>{growth.contextRefs&&<p className="creator-claim-review">Source basis: {growth.contextRefs.sources.map(source=>source.title).join(', ')||'Creator brief only'}{growth.contextRefs.profileRevision?' + reviewed creator profile':''}. Evidence is creator-attested. Recheck sources and review claims before publishing.</p>}
    <details className="growth-shared-brief" open={!growth.assets?.vsl}><summary>Shared offer brief <small>Positioning, story and evidence · reused across tools</small></summary>{growth.productFacts&&<aside className="growth-product-facts"><strong>Saved product facts</strong><p>{growth.productFacts.title} · {growth.productFacts.format} · {growth.productFacts.currency.toUpperCase()} {(growth.productFacts.priceCents/100).toFixed(2)}</p><p>{growth.productFacts.inclusions.join(" · ")||growth.productFacts.description}</p><a href={`/build/${product.id}?area=commerce`}>Review authoritative price & access</a><p>This brief supplies positioning and hypotheses. Saving it never changes product inclusions, checkout price or public pages.</p></aside>}<div className="growth-brief-grid">{growthQuestions.map((question, index) => <label className="growth-question" key={question.key}><span><small>{String(index + 1).padStart(2, '0')}</small>{question.label}</span><p>{question.hint}</p><textarea rows={question.key === 'story' ? 5 : 3} maxLength={4000} disabled={!!busy||historyBusy||recordingUploadBusy} value={growth.brief[question.key]} onChange={event => setGrowth({ ...growth, brief: { ...growth.brief, [question.key]: event.target.value } })} /></label>)}</div></details>
    <div className="growth-generate"><div><strong>{growth.assets ? 'Draft another script version' : 'Turn your brief into a spoken script'}</strong><p>{spent}. Creates one script proposal only. Page and email copy have separate review actions.</p>{growth.assets && <p>Generating keeps the current script unchanged until you review and apply the new proposal. Earlier saved versions remain in history. Pages, emails and recordings are untouched.</p>}{missing.length > 0 && <p>Complete {missing.length} more {missing.length === 1 ? 'answer' : 'answers'} to continue. “No proof yet” is a valid proof answer.</p>}{!aiReady && <p>AI copywriting is currently unavailable. You can keep editing and saving your brief.</p>}</div><button className="button primary" disabled={!!busy||historyBusy||recordingUploadBusy || !aiReady || missing.length > 0 || contextDirty} onClick={() => void generate()}>{busy === 'generate' ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}{busy === 'generate' ? 'Drafting your script…' : unlimited ? 'Draft script' : `Draft script · ${cost} credits`}</button></div>
    {proposal&&<section className="growth-script growth-asset-review" aria-label="Script proposal review"><h3>Review the new script version</h3><p>Brief revision {proposal.expectedUpdatedAt}. This draft has not replaced your saved script.</p><div className="growth-copy-comparison"><label>Saved script<textarea readOnly value={typeof proposal.baseValue==='string'?proposal.baseValue:''} rows={8}/></label><label>Proposed script<textarea readOnly value={typeof proposal.value==='string'?proposal.value:''} rows={8}/></label></div><label>How should this apply?<select value={applyMode} disabled={!!busy} onChange={event=>setApplyMode(event.target.value as 'append'|'replace')}><option value="append">Append as a new script version · preserve existing text</option><option value="replace">Replace the saved script after review</option></select></label><button className="button primary" disabled={!!busy||dirty||contextDirty||proposal.expectedUpdatedAt!==growth.updatedAt} onClick={()=>void applyProposal()}>{applyMode==='append'?'Append reviewed script':'Replace reviewed script'}</button>{proposal.expectedUpdatedAt!==growth.updatedAt&&<p>Saved copy or brief changed. Your proposal remains visible; request a fresh version before applying.</p>}<button className="button secondary" disabled={!!busy} onClick={()=>setProposal(null)}>Keep current script</button></section>}
    <section className="growth-script"><div className="growth-panel-heading"><div><span className="growth-eyebrow">VIDEO SALES LETTER</span><h2>Your script, in your voice.</h2><p>Review every claim. Rewrite anything you would not say, then record the video yourself.</p></div>{growth.assets?.vsl && <button className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(growth.assets!.vsl); setCopied(true); } catch { setError('Copy is unavailable. Select and copy the script below.'); } }}>{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? 'Copied' : 'Copy script'}</button>}</div>
      {growth.assets ? <textarea className="growth-script-editor" aria-label="Video sales letter script" rows={20} maxLength={24000} disabled={!!busy||historyBusy||recordingUploadBusy} value={growth.assets.vsl} onChange={event => { setCopied(false); setGrowth({ ...growth, assets: { ...growth.assets!, vsl: event.target.value } }); }} /> : <div className="growth-empty"><Mic size={27} /><h3>Your real story goes here.</h3><p>Write your own script or complete the brief above for AI help. A VSL is a sales conversation you record, built around your audience and your offer.</p><button className="button secondary" disabled={!!busy||historyBusy||recordingUploadBusy} onClick={() => setGrowth({ ...growth, assets: manualAssets() })}>Write my own script</button></div>}
      <div className="growth-script-footer"><span>{busy==='save'?'Saving…':error&&dirty?'Couldn’t save · changes kept':dirty||contextDirty?'Unsaved changes':'Saved as draft'}</span>{growth.assets && <button className="button secondary" disabled={!!busy||historyBusy||recordingUploadBusy || !dirty} onClick={() => void save()}><Save size={15} />Save script & follow-up</button>}</div>
    </section>
    <details className="growth-legacy-copy"><summary>Earlier personal follow-up draft</summary><p>This is retained legacy copy. Email drafts and sequence delivery now live in Emails; it has never sent automatically.</p><textarea aria-label="Earlier personal follow-up draft" rows={6} value={growth.assets?.followUp||''} disabled={!!busy} onChange={event=>setGrowth({...growth,assets:{...(growth.assets||manualAssets()),followUp:event.target.value}})}/><button className="button secondary" disabled={!!busy||!dirty} onClick={()=>void save()}>Save retained copy</button><a href={`/?project=${product.id}&area=automations`}>Open Emails</a></details>
    <section className="growth-script"><h3>Your creator recording</h3><p>Select a sales recording you intend to publish. Private Creator library recordings are separate and never appear here.</p><SalesRecordingPicker onBusyChange={setRecordingUploadBusy} productId={product.id} value={recording} onChange={setRecording} disabled={!!busy||historyBusy||recordingUploadBusy}/><button className="button secondary" disabled={!!busy||recording===savedRecording} onClick={()=>void saveRecording()}>Save recording selection privately</button><a className="button secondary" href={`/build/${product.id}?area=page`}>Choose a page video section</a></section>
    <MarketingVersionHistory productId={product.id} onBusyChange={setHistoryBusy} kind="growth" expectedUpdatedAt={growth.updatedAt} disabled={!!busy||historyBusy||recordingUploadBusy||dirty||contextDirty} onRestore={value=>{accept(value as Growth);setNotice('Earlier copy restored as an editable draft. Public pages are unchanged.');}}/>
    <aside className="growth-record-handoff"><span><Mic size={23} /></span><div><h3>Now make it sound like you.</h3><p>Record your VSL on your camera or phone. Select the finished sales recording above, add it to the intended page video section and review before publishing. This does not expose private lesson or AI-reference recordings.</p></div><ArrowRight size={22} /></aside>
  </div>;
}
