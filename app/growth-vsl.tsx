'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Clipboard, Loader2, Mic, Save, Sparkles } from 'lucide-react';
import type { Product } from '@/lib/product';
import { growthQuestions, missingGrowthAnswers, type Growth, type GrowthAssets } from '@/lib/growth';

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
  const [copied, setCopied] = useState(false), [retry, setRetry] = useState(0);
  const mounted = useRef(true), running = useRef(false);
  const dirtyCallback = useRef(onDirtyChange), updatedCallback = useRef(onUpdate), busyCallback = useRef(onBusyChange);
  useLayoutEffect(() => { dirtyCallback.current = onDirtyChange; updatedCallback.current = onUpdate; busyCallback.current = onBusyChange; }, [onDirtyChange, onUpdate, onBusyChange]);
  const dirty = !!growth && JSON.stringify(growth) !== baseline;
  useEffect(() => { dirtyCallback.current?.(dirty); }, [dirty]);
  useEffect(() => { busyCallback.current?.(!!busy); }, [busy]);
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
    setGrowth(value); setBaseline(JSON.stringify(value)); return true;
  }
  function manualAssets(): GrowthAssets {
    return { vsl: '', landing: { headline: product.title, subheadline: product.description.slice(0, 700), body: '', benefits: [], ctaLabel: 'Request details', thankYou: 'Thank you for your interest. Your request has been shared with the creator.' }, followUp: '' };
  }
  async function persist(value: Growth, id: string) {
    return growthRequest(`/api/products/${id}/growth`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief: value.brief, assets: value.assets, expectedUpdatedAt: value.updatedAt }) });
  }
  async function save() {
    if (!growth || running.current) return;
    const id = product.id; running.current = true; setBusy('save'); setError(''); setNotice('');
    try { if (accept(await persist(growth, id))) { setNotice('Your brief and script are saved.'); updatedCallback.current?.(); } }
    catch (reason) { if (mounted.current) setError((reason as Error).message); }
    finally { if (mounted.current) { running.current = false; setBusy(''); } }
  }
  async function generate() {
    if (!growth || running.current) return;
    const id = product.id; running.current = true; setBusy('generate'); setError(''); setNotice('');
    try {
      const saved = dirty || growth.updatedAt === 0 ? await persist(growth, id) : growth;
      if (!accept(saved)) return;
      const value = await growthRequest(`/api/products/${id}/growth/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedUpdatedAt: saved.updatedAt, requestId: crypto.randomUUID(), maxCredits: unlimited ? 0 : cost }) });
      if (accept(value)) { setNotice('Your VSL script, landing page copy, and follow-up draft are ready to review.'); updatedCallback.current?.(); }
    } catch (reason) { if (mounted.current) setError((reason as Error).message); }
    finally { if (mounted.current) { running.current = false; setBusy(''); } }
  }
  if (busy === 'loading') return <div className="growth-loading" role="status"><Loader2 className="spin" size={22} />Opening your growth brief…</div>;
  if (!growth) return <div className="growth-error" role="alert"><p>{error || 'Your growth workspace is unavailable.'}</p><button className="button secondary" onClick={() => { setBusy('loading'); setError(''); setRetry(value => value + 1); }}>Try again</button></div>;
  const missing = missingGrowthAnswers(growth.brief), spent = unlimited ? 'Included with your access' : `${cost} credits per run`;
  return <div className="growth-vsl">
    <div className="growth-panel-heading"><div><span className="growth-eyebrow">YOUR STORY. YOUR OFFER.</span><h2>Build the message before you record.</h2><p>Tell your growth operator who you help and why your offer matters. AI drafts the sales copy; you bring the expertise and voice.</p></div><button className="button secondary" disabled={!!busy || (!dirty && growth.updatedAt > 0)} onClick={() => void save()}>{busy === 'save' ? <Loader2 size={15} className="spin" /> : <Save size={15} />}Save brief & script</button></div>
    {error && <div className="growth-error" role="alert">{error}</div>}
    {notice && <div className="growth-notice" role="status"><Check size={17} />{notice}</div>}
    <div className="growth-brief-grid">{growthQuestions.map((question, index) => <label className="growth-question" key={question.key}><span><small>{String(index + 1).padStart(2, '0')}</small>{question.label}</span><p>{question.hint}</p><textarea rows={question.key === 'story' ? 5 : 3} maxLength={4000} disabled={!!busy} value={growth.brief[question.key]} onChange={event => setGrowth({ ...growth, brief: { ...growth.brief, [question.key]: event.target.value } })} /></label>)}</div>
    <div className="growth-generate"><div><strong>{growth.assets ? 'Refresh your growth copy' : 'Turn your answers into a clear message'}</strong><p>{spent}. Includes an editable VSL script, landing page, and follow-up email draft.</p>{growth.assets && <p>Generating again replaces the saved VSL, landing copy, and follow-up draft. Your recorded content stays yours.</p>}{missing.length > 0 && <p>Complete {missing.length} more {missing.length === 1 ? 'answer' : 'answers'} to continue. “No proof yet” is a valid proof answer.</p>}{!aiReady && <p>AI copywriting is currently unavailable. You can keep editing and saving your brief.</p>}</div><button className="button primary" disabled={!!busy || !aiReady || missing.length > 0} onClick={() => void generate()}>{busy === 'generate' ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />}{busy === 'generate' ? 'Writing your growth copy…' : unlimited ? 'Generate growth copy' : `Generate · ${cost} credits`}</button></div>
    <section className="growth-script"><div className="growth-panel-heading"><div><span className="growth-eyebrow">VIDEO SALES LETTER</span><h2>Your script, in your voice.</h2><p>Review every claim. Rewrite anything you would not say, then record the video yourself.</p></div>{growth.assets?.vsl && <button className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(growth.assets!.vsl); setCopied(true); } catch { setError('Copy is unavailable. Select and copy the script below.'); } }}>{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? 'Copied' : 'Copy script'}</button>}</div>
      {growth.assets ? <textarea className="growth-script-editor" aria-label="Video sales letter script" rows={20} maxLength={24000} disabled={!!busy} value={growth.assets.vsl} onChange={event => { setCopied(false); setGrowth({ ...growth, assets: { ...growth.assets!, vsl: event.target.value } }); }} /> : <div className="growth-empty"><Mic size={27} /><h3>Your real story goes here.</h3><p>Write your own script or complete the brief above for AI help. A VSL is a sales conversation you record, built around your audience and your offer.</p><button className="button secondary" disabled={!!busy} onClick={() => setGrowth({ ...growth, assets: manualAssets() })}>Write my own script</button></div>}
      <div className="growth-script-footer"><span>{dirty ? 'Unsaved changes' : 'Saved in your workspace'}</span>{growth.assets && <button className="button secondary" disabled={!!busy || !dirty} onClick={() => void save()}><Save size={15} />Save script & follow-up</button>}</div>
    </section>
    <section className="growth-script"><div className="growth-panel-heading"><div><span className="growth-eyebrow">FOLLOW-UP EMAIL</span><h2>Keep the conversation going.</h2><p>Write a subject and message for someone who requested details. Save this reusable draft, then personalize it for each lead in your email app.</p></div></div><textarea className="growth-script-editor" aria-label="Follow-up email draft" placeholder="Subject: Thanks for your interest…" rows={9} maxLength={12000} disabled={!!busy} value={growth.assets?.followUp || ''} onChange={event => setGrowth({ ...growth, assets: { ...(growth.assets || manualAssets()), followUp: event.target.value } })} /><div className="growth-script-footer"><span>Available with your leads in CRM after saving.</span><button className="button secondary" disabled={!!busy || !dirty} onClick={() => void save()}><Save size={15} />Save script & follow-up</button></div></section>
    <aside className="growth-record-handoff"><span><Mic size={23} /></span><div><h3>Now make it sound like you.</h3><p>Record your VSL on your camera or phone. Upload the finished video in your Funnel, review the landing page, and publish when you are ready.</p></div><ArrowRight size={22} /></aside>
  </div>;
}
