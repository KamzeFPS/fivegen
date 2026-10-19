'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, ChevronDown, ChevronUp, Loader2, MessageSquare, Minimize2, RefreshCw, Sparkles, WandSparkles } from 'lucide-react';
import {builderAgentFieldLabels,builderAgentFieldKeysForContext,type BuilderAgentContext,type BuilderAgentState,type BuilderAgentSuggestion,type BuilderAgentTarget,type BuilderAgentDetailsGroup,type BuilderAgentFieldKey,type BuilderAgentRefinement} from '@/lib/builder-assistant-contract';
import './builder-agent.css';

type AgentRequest = { requestId: string; message: string; expectedUpdatedAt: number; maxCredits: number; target: BuilderAgentTarget; detailsGroup?:BuilderAgentDetailsGroup;fieldKeys?:BuilderAgentFieldKey[];refinement?:BuilderAgentRefinement;context: BuilderAgentContext };
export type BuilderAgentFocus={id:string;message:string;detailsGroup:BuilderAgentDetailsGroup;fieldKeys?:BuilderAgentFieldKey[]};
type Props = {
  productId: string;
  context: BuilderAgentContext;
  onApply: (suggestion: BuilderAgentSuggestion,target?:BuilderAgentTarget,refinement?:BuilderAgentRefinement) => void | boolean | Promise<void | boolean>;
  onBeforeSend?:()=>Promise<void>;
  onGenerate?: () => void;
  onMinimizedChange?: (minimized: boolean) => void;
  generateDisabled?: boolean;
  focus?:BuilderAgentFocus|null;
};

function excerpt(context: BuilderAgentContext): BuilderAgentContext {
  return { type: context.type.slice(0, 80),builderType:context.builderType,deliveryFamily:context.deliveryFamily, title: context.title.slice(0, 160), description: context.description.slice(0, 2000), audience: context.audience.slice(0, 1000), language: context.language.slice(0, 80), fields: Object.fromEntries(Object.entries(context.fields || {}).slice(0, 24).map(([key, value]) => [key.slice(0, 80), value.slice(0, 400)])), sections: (context.sections || []).slice(0, 24).map(section => ({ title: section.title.slice(0, 160) || 'Untitled section', body: section.body.slice(0, 280) })) };
}

export function BuilderAgent({ productId, context, onApply,onBeforeSend, onGenerate, onMinimizedChange, generateDisabled,focus }: Props) {
  const [state, setState] = useState<BuilderAgentState | null>(null);
  const [minimized, setMinimized] = useState(true), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false),[isDrawer,setIsDrawer]=useState(false);
  const [message, setMessage] = useState(''), [answers, setAnswers] = useState<Record<string, string>>({}), [error, setError] = useState('');
  const [target, setTarget] = useState<BuilderAgentTarget>('details'),[detailsGroup,setDetailsGroup]=useState<BuilderAgentDetailsGroup|undefined>(),[fieldKeys,setFieldKeys]=useState<BuilderAgentFieldKey[]|undefined>(), [applying, setApplying] = useState(''), [applied, setApplied] = useState<string[]>([]);
  const [pending, setPending] = useState<AgentRequest | null>(null), [loadedStorageKey, setLoadedStorageKey] = useState('');
  const [refineSectionId,setRefineSectionId]=useState(''),[refineText,setRefineText]=useState('');
  const listRef = useRef<HTMLDivElement>(null), inputRef = useRef<HTMLTextAreaElement>(null), sendingRef = useRef(false), followsRef = useRef(true);
  const panelRef=useRef<HTMLElement>(null),launcherRef=useRef<HTMLButtonElement>(null),returnFocusRef=useRef<HTMLElement|null>(null);
  const storageKey = `fivegen:builder-agent:${productId}`;
  const messages = state?.conversation.messages || [], latest = messages.at(-1);
  const sameScope=(latest?.target||'outline')===target&&(target!=='details'||((latest?.detailsGroup||'')===(detailsGroup||'')&&JSON.stringify(latest?.fieldKeys||[])===JSON.stringify(fieldKeys||[])));
  const questions = latest?.role === 'assistant'&&sameScope ? latest.questions || [] : [];
  const scopeLabel=fieldKeys?.length?(fieldKeys.length>3?`Selected fields (${fieldKeys.length})`:fieldKeys.map(key=>builderAgentFieldLabels[key]).join(', ')):detailsGroup==='essentials'?'The essentials':detailsGroup==='type-details'?'Product-specific fields':'Product details';
  const combined = [...questions.filter(q => answers[q]?.trim()).map(q => `${q}\nMy answer: ${answers[q].trim()}`), message.trim()].filter(Boolean).join('\n\n');
  const charge = state && !state.unlimited && state.remaining === 0 ? state.cost : 0;
  const refineSection=context.sections.find(section=>section.id===refineSectionId),refineIndex=refineSection?.body.indexOf(refineText)??-1;
  const validRefinement=!!refineSection?.id&&!!refineText.trim()&&refineText.length<=1800&&refineIndex>=0&&refineSection.body.indexOf(refineText,refineIndex+1)===-1;
  const canSend = Boolean(state?.aiReady && combined.length >= 3 && combined.length <= 3000 && !busy && !loading && !pending && (target!=='refine'||validRefinement) && (state.unlimited || state.credits >= charge));

  function changeMinimized(value: boolean) { if(!value&&document.activeElement instanceof HTMLElement)returnFocusRef.current=document.activeElement;setMinimized(value); onMinimizedChange?.(value); }
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
    let saved: { minimized?: boolean; message?: string; answers?: Record<string, string>; target?: BuilderAgentTarget;scopeVersion?:number;detailsGroup?:BuilderAgentDetailsGroup;fieldKeys?:BuilderAgentFieldKey[]; applied?: string[]; pending?: AgentRequest } = {};
    try { saved = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch {}
    const smallScreen=window.matchMedia('(max-width: 1179px)').matches;changeMinimized(smallScreen?true:typeof saved.minimized==='boolean'?saved.minimized:false); setMessage(typeof saved.message === 'string' ? saved.message.slice(0, 3000) : '');
    if (saved.answers && typeof saved.answers === 'object') setAnswers(Object.fromEntries(Object.entries(saved.answers).filter((entry): entry is [string, string] => typeof entry[1] === 'string').map(([key, value]) => [key, value.slice(0, 650)])));
    if(saved.scopeVersion===2&&['details','outline','refine'].includes(saved.target||'')){setTarget(saved.target!);setDetailsGroup(saved.detailsGroup);setFieldKeys(saved.fieldKeys);}else{setTarget('details');setDetailsGroup(undefined);setFieldKeys(undefined);}
    if (Array.isArray(saved.applied)) setApplied(saved.applied.filter(id => typeof id === 'string'));
    if (saved.pending?.requestId) setPending(saved.pending);
    setLoadedStorageKey(storageKey);
    const controller = new AbortController(); void reload(controller.signal);
    return () => controller.abort();
  }, [productId]);

  useEffect(()=>{const query=window.matchMedia('(max-width: 1179px)');setIsDrawer(query.matches);const resize=()=>{setIsDrawer(query.matches);if(query.matches)changeMinimized(true);};query.addEventListener('change',resize);return()=>query.removeEventListener('change',resize);},[]);
  useEffect(()=>{
    if(minimized||!isDrawer)return;
    const priorOverflow=document.documentElement.style.overflow;document.documentElement.style.overflow='hidden';
    const frame=requestAnimationFrame(()=>inputRef.current?.focus({preventScroll:true}));
    function handleKey(event:KeyboardEvent){
      // Review and generation dialogs sit above this drawer and keep their own focus.
      if(document.querySelector('[data-slot="dialog-content"]'))return;
      if(event.key==='Escape'){event.preventDefault();changeMinimized(true);return;}
      if(event.key!=='Tab'||!panelRef.current)return;
      const controls=Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],textarea:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')).filter(element=>element.getClientRects().length>0),first=controls[0],last=controls.at(-1);
      if(!first)return;if(event.shiftKey&&(document.activeElement===first||!panelRef.current.contains(document.activeElement))){event.preventDefault();last?.focus();}else if(!event.shiftKey&&(document.activeElement===last||!panelRef.current.contains(document.activeElement))){event.preventDefault();first.focus();}
    }
    document.addEventListener('keydown',handleKey);return()=>{cancelAnimationFrame(frame);document.documentElement.style.overflow=priorOverflow;document.removeEventListener('keydown',handleKey);};
  },[minimized,isDrawer]);
  useEffect(()=>{if(!minimized||!returnFocusRef.current)return;const frame=requestAnimationFrame(()=>{const previous=returnFocusRef.current;if(previous?.isConnected&&previous!==document.body)previous.focus({preventScroll:true});else launcherRef.current?.focus({preventScroll:true});});return()=>cancelAnimationFrame(frame);},[minimized]);
  useEffect(()=>{if(minimized||!focus)return;const frame=requestAnimationFrame(()=>inputRef.current?.focus({preventScroll:true}));return()=>cancelAnimationFrame(frame);},[minimized,focus?.id]);

  useEffect(() => { if (loadedStorageKey !== storageKey) return; try { localStorage.setItem(storageKey, JSON.stringify({ minimized, message, answers, target,detailsGroup,fieldKeys,scopeVersion:2, applied, pending })); } catch {} }, [storageKey, loadedStorageKey, minimized, message, answers, target,detailsGroup,fieldKeys, applied, pending]);
  useEffect(()=>{if(!focus)return;if(sendingRef.current||pending){setError('Finish the current request before switching to another field.');return;}changeMinimized(false);setTarget('details');setDetailsGroup(focus.detailsGroup);setFieldKeys(focus.fieldKeys);setMessage(current=>current.trim()?`${focus.message}\n\nAdditional notes:\n${current}`:focus.message);setError('');inputRef.current?.focus({preventScroll:true});},[focus?.id]);
  useEffect(()=>{const allowed=builderAgentFieldKeysForContext(context);if(fieldKeys?.some(key=>!allowed.includes(key)))setFieldKeys(undefined);if(detailsGroup==='type-details'&&!builderAgentFieldKeysForContext(context,'type-details').length)setDetailsGroup(undefined);},[context.builderType,context.deliveryFamily,fieldKeys,detailsGroup]);
  useEffect(() => { if (followsRef.current && listRef.current) listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: 'instant' }); }, [latest?.id, busy, minimized]);

  async function send(existing?: AgentRequest) {
    if (sendingRef.current || (!existing && !canSend) || !state) return;
    sendingRef.current = true; setBusy(true); setError('');
    try{if(!existing)await onBeforeSend?.();}catch(cause){sendingRef.current=false;setBusy(false);setError(cause instanceof Error?cause.message:'Save your draft before asking AI.');return;}
    const refinement=target==='refine'&&refineSection?.id?{sectionId:refineSection.id,originalTitle:refineSection.title,originalText:refineText}:undefined;
    const payload: AgentRequest = existing || { requestId: crypto.randomUUID(), message: combined, expectedUpdatedAt: state.conversation.updatedAt, maxCredits: charge, target,...(target==='details'?{detailsGroup,fieldKeys}:{}),...(refinement?{refinement}:{}), context: target==='refine'&&refinement?{...excerpt(context),sections:[{id:refinement.sectionId,title:refinement.originalTitle,body:refinement.originalText}]}:excerpt(context) };
    setPending(payload); followsRef.current = true;
    // Save the request identity before transmission, so a lost response can be retried without a second charge.
    try { localStorage.setItem(storageKey, JSON.stringify({ minimized, message, answers, target,detailsGroup,fieldKeys,scopeVersion:2, applied, pending: payload })); } catch {}
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(productId)}/builder-assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json() as BuilderAgentState & { error?: string };
      if (!response.ok) { setPending(null); if (response.status === 409 || response.status === 402) void reload(); throw new Error(result.error || 'Your assistant could not respond.'); }
      setState(result);const reply=result.conversation.messages.at(-1);if(reply?.target)setTarget(reply.target);setDetailsGroup(payload.detailsGroup);setFieldKeys(payload.fieldKeys);setMessage(''); setAnswers({}); setPending(null); inputRef.current?.focus({ preventScroll: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Connection interrupted. Retry the saved request to avoid a duplicate charge.'); }
    finally { sendingRef.current = false; setBusy(false); }
  }

  async function apply(id: string, suggestion: BuilderAgentSuggestion) {
    setApplying(id); setError('');
    try { const original=messages.find(item=>item.id===id);if (await onApply(suggestion,original?.target,original?.refinement) !== false) setApplied(current => [...current, id]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The suggestion could not be applied.'); }
    finally { setApplying(''); }
  }
  function chooseRefineSection(id:string){const section=context.sections.find(item=>item.id===id);setRefineSectionId(id);setRefineText(section?.body.slice(0,1000)||'');}
  function chooseTarget(value:BuilderAgentTarget){if(busy||pending)return;setTarget(value);setDetailsGroup(undefined);setFieldKeys(undefined);if(value==='refine'&&!refineSectionId)chooseRefineSection(context.sections.find(section=>section.id&&section.body.trim())?.id||'');}

  if (minimized) return <aside className="builder-agent is-minimized" aria-label="AI product assistant"><button ref={launcherRef} className="builder-agent-reopen" onClick={() => changeMinimized(false)} aria-label="Open AI assistant" aria-expanded={false} title="Open AI assistant"><Sparkles size={19}/><span>AI assistant</span>{busy && <Loader2 size={13} className="spin"/>}</button></aside>;

  return <>{isDrawer&&<button type="button" className="builder-agent-backdrop" aria-label="Close AI assistant" tabIndex={-1} onClick={()=>changeMinimized(true)}/>}<aside ref={panelRef} className="builder-agent" role={isDrawer?'dialog':undefined} aria-modal={isDrawer?true:undefined} aria-label="AI product assistant">
    <header className="builder-agent-heading"><div className="builder-agent-avatar"><Sparkles size={18}/></div><div><h2>FiveGen assistant</h2><p>Your idea. Built together.</p></div><button onClick={() => changeMinimized(true)} aria-label="Minimize AI assistant" title="Minimize assistant"><Minimize2 size={17}/></button></header>
    <div className="builder-agent-history" ref={listRef} onScroll={() => { const list = listRef.current; if (list) followsRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 90; }}>
      {state && !state.aiReady && <p className="builder-agent-notice">AI setup pending. You can keep editing.</p>}
      {loading && !state ? <p className="builder-agent-loading" role="status"><Loader2 size={16} className="spin"/>Loading your conversation…</p> : !messages.length && <div className="builder-agent-welcome"><span><WandSparkles size={22}/></span><h3>A second mind for your {context.type.toLowerCase()}.</h3><p>Improve your product fields, plan an outline, or refine an excerpt. Choose the task, then review the proposed updates.</p><div>{[{prompt:'Enhance my product details',mode:'details' as const},{prompt:'Make my product outcome clearer',mode:'details' as const},{prompt:'Suggest an outline for this product',mode:'outline' as const}].map(({prompt,mode}) => <button key={prompt} onClick={() => { chooseTarget(mode);setMessage(prompt); inputRef.current?.focus(); }}><MessageSquare size={13}/>{prompt}</button>)}</div></div>}
      {messages.map(item => <article className={`builder-agent-message ${item.role}`} key={item.id}><strong>{item.role === 'assistant' ? 'FiveGen' : 'You'}</strong><p>{item.content}</p>{item.suggestion && <div className="builder-agent-suggestion"><span><Sparkles size={13}/>{item.refinement?'Suggested excerpt update':item.suggestion.sections?.length?'Suggested content':'Suggested field updates'}</span><p>{item.suggestion.summary}</p><details><summary>Review changes<ChevronDown size={13}/></summary>{item.suggestion.title && <div><b>Product name</b><p>{item.suggestion.title}</p></div>}{item.suggestion.description && <div><b>Product description</b><p>{item.suggestion.description}</p></div>}{item.suggestion.audience && <div><b>Who is this for?</b><p>{item.suggestion.audience}</p></div>}{Object.entries(item.suggestion.fields||{}).map(([key,value])=><div key={key}><b>{builderAgentFieldLabels[key as BuilderAgentFieldKey]||key}</b><p>{value}</p></div>)}{item.suggestion.sections?.map((section, index) => <div key={index}><b>{index + 1}. {section.title}</b><p>{section.body}</p></div>)}</details><button disabled={Boolean(applying) || applied.includes(item.id)} onClick={() => void apply(item.id, item.suggestion!)}>{applying === item.id ? <Loader2 size={14} className="spin"/> : applied.includes(item.id) ? <Check size={14}/> : <ChevronUp size={14}/ >}{applied.includes(item.id) ? 'Applied to builder' : 'Review & apply'}</button></div>}{item.questions?.length && (item.id !== latest?.id||!sameScope) ? <details className="builder-agent-previous-questions"><summary>Questions from this step</summary>{item.questions.map(question => <p key={question}>{question}</p>)}</details> : null}</article>)}
      {!!questions.length && <fieldset className="builder-agent-answers" disabled={busy}><legend>Answer together, or reply below</legend>{questions.map((question, index) => <label key={`${latest?.id}:${index}`}><span>{index + 1}. {question}</span><textarea rows={2} maxLength={650} placeholder="Your answer…" value={answers[question] || ''} onChange={event => setAnswers(current => ({ ...current, [question]: event.target.value }))}/></label>)}</fieldset>}
      {busy && <p className="builder-agent-thinking" role="status"><Loader2 size={14} className="spin"/>Thinking about your product…</p>}
    </div>
    <div className="builder-agent-dock">
      {error && <div className="builder-agent-error" role="alert"><p>{error}</p>{pending && !busy ? <button onClick={() => void send(pending)}><RefreshCw size={13}/>Retry saved request</button> : !state && <button onClick={() => void reload()}><RefreshCw size={13}/>Reload assistant</button>}</div>}

      <form onSubmit={event => { event.preventDefault(); void send(); }}>
        <div className="builder-agent-target" aria-label="Assistant task">{([{id:'details',label:'Product details'},{id:'outline',label:'Outline'},{id:'refine',label:'Refine excerpt'}] as const).map(item=><button key={item.id} type="button" disabled={busy||!!pending} aria-pressed={target===item.id} onClick={()=>chooseTarget(item.id)}>{item.label}</button>)}</div>
        {target==='details'&&<label className="builder-agent-field-scope"><span>Editing</span><select aria-label="Fields to improve" disabled={busy||!!pending} value={fieldKeys?.length?'selected':detailsGroup||'all'} onChange={event=>{setFieldKeys(undefined);setDetailsGroup(event.target.value==='all'?undefined:event.target.value as BuilderAgentDetailsGroup);}}>{fieldKeys?.length&&<option value="selected">{scopeLabel}</option>}<option value="all">All product details</option><option value="essentials">The essentials</option>{builderAgentFieldKeysForContext(context,'type-details').length>0&&<option value="type-details">{context.builderType==='book'?'The shape of your book':'Product-specific fields'}</option>}</select></label>}
        {target==='refine'&&<div className="builder-agent-refine"><label className="builder-agent-field-scope"><span>Section</span><select aria-label="Section to refine" value={refineSectionId} disabled={busy||!!pending} onChange={event=>chooseRefineSection(event.target.value)}><option value="">Choose written content</option>{context.sections.filter(section=>section.id&&section.body.trim()).map(section=><option key={section.id} value={section.id}>{section.title}</option>)}</select></label><label><span>Original excerpt</span><textarea aria-label="Original excerpt to refine" value={refineText} onChange={event=>setRefineText(event.target.value)} maxLength={1800} rows={3} disabled={busy||!!pending||!refineSection} placeholder="Select a section, then keep or paste the exact passage to improve."/></label><small>{!refineSection?'Add written content to a section before refining.':validRefinement?'Only this passage will change. The rest of your product stays intact.':'Use an exact passage that appears once in this section, up to 1,800 characters.'}</small></div>}
        <textarea ref={inputRef} value={message} onChange={event => setMessage(event.target.value)} rows={2} maxLength={3000} aria-label="Message your product assistant" placeholder={questions.length ? 'Add anything else, then send all answers…' : 'Ask about your product…'} disabled={busy || Boolean(pending)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && !window.matchMedia('(pointer: coarse)').matches) { event.preventDefault(); void send(); } }}/>
        <div className="builder-agent-compose-bottom"><span>{busy ? 'Working…' : !state ? 'Private product conversation' : state.unlimited ? 'Unlimited planning' : state.remaining > 0 ? `${state.remaining} included planning messages` : `${state.cost} credits / planning message`}</span><button type="submit" disabled={!canSend} aria-label="Send message and answers">{busy ? <Loader2 size={16} className="spin"/> : <ArrowUp size={16}/>}</button></div>
      </form>
      {combined.length > 3000 && <p className="builder-agent-notice" role="alert">Shorten your combined reply by {combined.length - 3000} characters.</p>}
      {state && !state.unlimited && state.remaining === 0 && state.credits < state.cost && <a className="builder-agent-credit-link" href="/pricing">Add credits to continue planning</a>}
      {onGenerate && <button className="builder-agent-generate" onClick={onGenerate} disabled={busy || generateDisabled}><WandSparkles size={15}/><span>Generate product<small>Uses your product allowance or credits</small></span></button>}
      <p className="builder-agent-footer">Suggestions stay separate until you apply them.</p>
    </div>
  </aside></>;
}
