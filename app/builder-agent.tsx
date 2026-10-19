'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronDown, ChevronUp, Loader2, MessageSquare, Minimize2, RefreshCw, Sparkles, WandSparkles } from 'lucide-react';
import type { BuilderAgentContext, BuilderAgentState, BuilderAgentSuggestion } from '@/lib/builder-assistant-contract';
import './builder-agent.css';

type AgentRequest = { requestId: string; message: string; expectedUpdatedAt: number; maxCredits: number; target: 'outline' | 'refine'; context: BuilderAgentContext };
type Props = {
  productId: string;
  context: BuilderAgentContext;
  onApply: (suggestion: BuilderAgentSuggestion) => void | boolean | Promise<void | boolean>;
  onGenerate?: () => void;
  onMinimizedChange?: (minimized: boolean) => void;
  generateDisabled?: boolean;
};

function excerpt(context: BuilderAgentContext): BuilderAgentContext {
  return { type: context.type.slice(0, 80), title: context.title.slice(0, 160), description: context.description.slice(0, 2000), audience: context.audience.slice(0, 1000), language: context.language.slice(0, 80), fields: Object.fromEntries(Object.entries(context.fields || {}).slice(0, 16).map(([key, value]) => [key.slice(0, 80), value.slice(0, 400)])), sections: (context.sections || []).slice(0, 24).map(section => ({ title: section.title.slice(0, 160) || 'Untitled section', body: section.body.slice(0, 280) })) };
}

export function BuilderAgent({ productId, context, onApply, onGenerate, onMinimizedChange, generateDisabled }: Props) {
  const [state, setState] = useState<BuilderAgentState | null>(null);
  const [minimized, setMinimized] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''), [answers, setAnswers] = useState<Record<string, string>>({}), [error, setError] = useState('');
  const [target, setTarget] = useState<'outline' | 'refine'>('outline'), [applying, setApplying] = useState(''), [applied, setApplied] = useState<string[]>([]);
  const [pending, setPending] = useState<AgentRequest | null>(null), [loadedStorageKey, setLoadedStorageKey] = useState('');
  const listRef = useRef<HTMLDivElement>(null), inputRef = useRef<HTMLTextAreaElement>(null), sendingRef = useRef(false), followsRef = useRef(true);
  const storageKey = `fivegen:builder-agent:${productId}`;
  const messages = state?.conversation.messages || [], latest = messages.at(-1);
  const questions = latest?.role === 'assistant' ? latest.questions || [] : [];
  const combined = [...questions.filter(q => answers[q]?.trim()).map(q => `${q}\nMy answer: ${answers[q].trim()}`), message.trim()].filter(Boolean).join('\n\n');
  const charge = state && !state.unlimited && state.remaining === 0 ? state.cost : 0;
  const canSend = Boolean(state?.aiReady && combined.length >= 3 && combined.length <= 3000 && !busy && !loading && !pending && (state.unlimited || state.credits >= charge));

  function changeMinimized(value: boolean) { setMinimized(value); onMinimizedChange?.(value); }
  async function reload(signal?: AbortSignal) {
    setLoading(true);
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(productId)}/builder-assistant`, { signal, cache: 'no-store' });
      const result = await response.json() as BuilderAgentState & { error?: string };
      if (signal?.aborted) return;
      if (!response.ok) throw new Error(result.error || 'Could not load your assistant.');
      setState(result); setError('');
      setPending(current => current && result.conversation.messages.some(m => m.id === current.requestId) ? null : current);
    } catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError(cause instanceof Error ? cause.message : 'Could not load your assistant.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  }

  useEffect(() => {
    setLoadedStorageKey(''); setState(null); setPending(null); setAnswers({}); setMessage(''); setApplied([]);
    let saved: { minimized?: boolean; message?: string; answers?: Record<string, string>; target?: 'outline' | 'refine'; applied?: string[]; pending?: AgentRequest } = {};
    try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch {}
    changeMinimized(typeof saved.minimized === 'boolean' ? saved.minimized : window.matchMedia('(max-width: 820px)').matches); setMessage(typeof saved.message === 'string' ? saved.message.slice(0, 3000) : '');
    if (saved.answers && typeof saved.answers === 'object') setAnswers(Object.fromEntries(Object.entries(saved.answers).filter((entry): entry is [string, string] => typeof entry[1] === 'string').map(([key, value]) => [key, value.slice(0, 650)])));
    if (saved.target === 'outline' || saved.target === 'refine') setTarget(saved.target);
    if (Array.isArray(saved.applied)) setApplied(saved.applied.filter(id => typeof id === 'string'));
    if (saved.pending?.requestId) setPending(saved.pending);
    setLoadedStorageKey(storageKey);
    const controller = new AbortController(); void reload(controller.signal);
    return () => controller.abort();
  }, [productId]);

  useEffect(() => { if (loadedStorageKey !== storageKey) return; try { localStorage.setItem(storageKey, JSON.stringify({ minimized, message, answers, target, applied, pending })); } catch {} }, [storageKey, loadedStorageKey, minimized, message, answers, target, applied, pending]);
  useEffect(() => { if (followsRef.current && listRef.current) listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'instant' }); }, [latest?.id, busy, minimized]);

  async function send(existing?: AgentRequest) {
    if (sendingRef.current || (!existing && !canSend) || !state) return;
    const payload: AgentRequest = existing || { requestId: crypto.randomUUID(), message: combined, expectedUpdatedAt: state.conversation.updatedAt, maxCredits: charge, target, context: excerpt(context) };
    sendingRef.current = true; setBusy(true); setError(''); setPending(payload); followsRef.current = true;
    // Save the request identity before transmission, so a lost response can be retried without a second charge.
    try { localStorage.setItem(storageKey, JSON.stringify({ minimized, message, answers, target, applied, pending: payload })); } catch {}
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(productId)}/builder-assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json() as BuilderAgentState & { error?: string };
      if (!response.ok) { setPending(null); if (response.status === 409 || response.status === 402) void reload(); throw new Error(result.error || 'Your assistant could not respond.'); }
      setState(result); setMessage(''); setAnswers({}); setPending(null); inputRef.current?.focus({ preventScroll: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Connection interrupted. Retry the saved request to avoid a duplicate charge.'); }
    finally { sendingRef.current = false; setBusy(false); }
  }

  async function apply(id: string, suggestion: BuilderAgentSuggestion) {
    setApplying(id); setError('');
    try { if (await onApply(suggestion) !== false) setApplied(current => [...current, id]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The suggestion could not be applied.'); }
    finally { setApplying(''); }
  }

  if (minimized) return <aside className="builder-agent is-minimized" aria-label="AI product assistant"><button className="builder-agent-reopen" onClick={() => changeMinimized(false)} aria-label="Open AI assistant" title="Open AI assistant"><Sparkles size={19}/><span>AI</span>{busy && <Loader2 size={13} className="spin"/>}</button></aside>;

  return <aside className="builder-agent" aria-label="AI product assistant">
    <header className="builder-agent-heading"><div className="builder-agent-avatar"><Sparkles size={18}/></div><div><h2>FiveGen assistant</h2><p>Your idea. Built together.</p></div><button onClick={() => changeMinimized(true)} aria-label="Minimize AI assistant" title="Minimize assistant"><Minimize2 size={17}/></button></header>
    <div className="builder-agent-history" ref={listRef} onScroll={() => { const list = listRef.current; if (list) followsRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 90; }}>
      {loading && !state ? <p className="builder-agent-loading" role="status"><Loader2 size={16} className="spin"/>Loading your conversation…</p> : !messages.length && <div className="builder-agent-welcome"><span><WandSparkles size={22}/></span><h3>A second mind for your {context.type.toLowerCase()}.</h3><p>Plan the structure, sharpen your description, or refine a small excerpt. Review every suggestion before applying it.</p><div>{['Suggest an outline for this product', 'Make the outcome clearer', 'What is missing from my product?'].map(prompt => <button key={prompt} onClick={() => { setMessage(prompt); inputRef.current?.focus(); }}><MessageSquare size={13}/>{prompt}</button>)}</div></div>}
      {messages.map(item => <article className={`builder-agent-message ${item.role}`} key={item.id}><strong>{item.role === 'assistant' ? 'FiveGen' : 'You'}</strong><p>{item.content}</p>{item.suggestion && <div className="builder-agent-suggestion"><span><Sparkles size={13}/>Suggested edit</span><p>{item.suggestion.summary}</p><details><summary>Review changes<ChevronDown size={13}/></summary>{item.suggestion.title && <div><b>Title</b><p>{item.suggestion.title}</p></div>}{item.suggestion.description && <div><b>Description</b><p>{item.suggestion.description}</p></div>}{item.suggestion.audience && <div><b>Audience</b><p>{item.suggestion.audience}</p></div>}{item.suggestion.sections?.map((section, index) => <div key={index}><b>{index + 1}. {section.title}</b><p>{section.body}</p></div>)}</details><button disabled={Boolean(applying) || applied.includes(item.id)} onClick={() => void apply(item.id, item.suggestion!)}>{applying === item.id ? <Loader2 size={14} className="spin"/> : applied.includes(item.id) ? <Check size={14}/> : <ChevronUp size={14}/ >}{applied.includes(item.id) ? 'Applied to builder' : 'Apply suggestion'}</button></div>}{item.questions?.length && item.id !== latest?.id ? <details className="builder-agent-previous-questions"><summary>Questions from this step</summary>{item.questions.map(question => <p key={question}>{question}</p>)}</details> : null}</article>)}
      {!!questions.length && <fieldset className="builder-agent-answers" disabled={busy}><legend>Answer together, or reply below</legend>{questions.map((question, index) => <label key={`${latest?.id}:${index}`}><span>{index + 1}. {question}</span><textarea rows={2} maxLength={650} placeholder="Your answer…" value={answers[question] || ''} onChange={event => setAnswers(current => ({ ...current, [question]: event.target.value }))}/></label>)}</fieldset>}
      {busy && <p className="builder-agent-thinking" role="status"><Loader2 size={14} className="spin"/>Thinking about your product…</p>}
    </div>
    <div className="builder-agent-dock">
      {error && <div className="builder-agent-error" role="alert"><p>{error}</p>{pending && !busy ? <button onClick={() => void send(pending)}><RefreshCw size={13}/>Retry saved request</button> : !state && <button onClick={() => void reload()}><RefreshCw size={13}/>Reload assistant</button>}</div>}
      {state && !state.aiReady && <p className="builder-agent-notice">AI is being configured by the administrator. You can keep editing and uploading your content.</p>}
      <form onSubmit={event => { event.preventDefault(); void send(); }}>
        <div className="builder-agent-target" aria-label="Assistant task"><button type="button" aria-pressed={target === 'outline'} onClick={() => setTarget('outline')}>Plan & outline</button><button type="button" aria-pressed={target === 'refine'} onClick={() => setTarget('refine')}>Refine a snippet</button></div>
        <textarea ref={inputRef} value={message} onChange={event => setMessage(event.target.value)} rows={3} maxLength={3000} aria-label="Message your product assistant" placeholder={questions.length ? 'Add anything else, then send all answers…' : 'Ask about your product…'} disabled={busy || Boolean(pending)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !window.matchMedia('(pointer: coarse)').matches) { event.preventDefault(); void send(); } }}/>
        <div className="builder-agent-compose-bottom"><span>{busy ? 'Working…' : !state ? 'Private product conversation' : state.unlimited ? 'Unlimited planning' : state.remaining > 0 ? `${state.remaining} included planning messages` : `${state.cost} credits / planning message`}</span><button type="submit" disabled={!canSend} aria-label="Send message and answers">{busy ? <Loader2 size={16} className="spin"/> : <ArrowUp size={16}/>}</button></div>
      </form>
      {combined.length > 3000 && <p className="builder-agent-notice" role="alert">Shorten your combined reply by {combined.length - 3000} characters.</p>}
      {state && !state.unlimited && state.remaining === 0 && state.credits < state.cost && <a className="builder-agent-credit-link" href="/pricing">Add credits to continue planning</a>}
      {onGenerate && <button className="builder-agent-generate" onClick={onGenerate} disabled={busy || generateDisabled}><WandSparkles size={15}/><span>Generate product<small>Uses your product allowance or credits</small></span></button>}
      <p className="builder-agent-footer">Suggestions stay separate until you apply them.</p>
    </div>
  </aside>;
}
