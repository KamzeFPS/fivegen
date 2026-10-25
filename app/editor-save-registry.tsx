'use client';
import {createContext,useCallback,useContext,useEffect,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {Loader2} from 'lucide-react';
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {createEditorSaveRegistry,type EditorSaveEntry} from '@/lib/editor-save-registry';

type Registry=ReturnType<typeof createEditorSaveRegistry>;
type ContextValue={registry:Registry;requestNavigation:(action:()=>void)=>void};
const EditorSaveContext=createContext<ContextValue|null>(null);
export function EditorSaveProvider({children}:{children:ReactNode}){
 const [registry]=useState(createEditorSaveRegistry),[pending,setPending]=useState<(()=>void)|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const running=useRef(false);
 useEffect(()=>{const beforeUnload=(event:BeforeUnloadEvent)=>{if(registry.hasDirty()||registry.isBusy()){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',beforeUnload);return()=>window.removeEventListener('beforeunload',beforeUnload);},[registry]);
 const requestNavigation=useCallback((action:()=>void)=>{
  if(registry.isBusy()){setError('Wait for the current operation to finish, then try again.');setPending(()=>action);return;}
  if(registry.hasDirty()){setError('');setPending(()=>action);return;}
  action();
 },[registry]);
 const manual=registry.snapshot().find(entry=>entry.dirty&&entry.manualReview);
 function discardAndContinue(){if(running.current||!registry.canDiscard())return;registry.discardAll();const action=pending;setPending(null);setError('');requestAnimationFrame(()=>action?.());}
 async function saveAndContinue(){
  if(running.current)return;running.current=true;setSaving(true);setError('');
  try{const result=await registry.saveAll();if(!result.ok){setError(result.message);return;}const action=pending;setPending(null);action?.();}
  finally{running.current=false;setSaving(false);}
 }
 return <EditorSaveContext.Provider value={{registry,requestNavigation}}>{children}<Dialog open={!!pending} onOpenChange={open=>{if(!open&&!running.current){setPending(null);setError('');}}}><DialogContent><DialogHeader><DialogTitle>Save before moving on?</DialogTitle><DialogDescription>{manual?'These customer-visible changes need a deliberate save in their panel. Keep editing to review them, or discard the unsaved changes.':'Save your current drafts, then continue. Public pages, approved emails and payment settings stay on their existing versions.'}</DialogDescription></DialogHeader><p role="status" aria-live="polite">{saving?'Saving your drafts…':registry.snapshot().filter(entry=>entry.dirty).map(entry=>entry.label).join(' · ')||'Current editor'}</p>{manual&&<p className="growth-error" role="status">{manual.manualReview}</p>}{error&&<p className="growth-error" role="alert">{error}</p>}<DialogFooter><button className="button secondary" disabled={saving} onClick={()=>{setPending(null);setError('');}}>Keep editing</button>{registry.canDiscard()&&<button className="button secondary" disabled={saving||registry.isBusy()} onClick={discardAndContinue}>Discard changes & continue</button>}{!manual&&<button className="button primary" disabled={saving} onClick={()=>void saveAndContinue()}>{saving&&<Loader2 size={15} className="spin"/>}{saving?'Saving…':'Save & continue'}</button>}</DialogFooter></DialogContent></Dialog></EditorSaveContext.Provider>;
}
export function useEditorSaveRegistry(){return useContext(EditorSaveContext);}
export function useRegisterEditorSave(entry:EditorSaveEntry){
 const context=useEditorSaveRegistry(),latest=useRef(entry),key=useRef<symbol>(Symbol('editor-save'));
 useLayoutEffect(()=>{latest.current=entry;});
 useLayoutEffect(()=>context?.registry.register(key.current,()=>latest.current),[context?.registry]);
}
